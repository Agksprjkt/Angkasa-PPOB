import 'server-only';

import { and, eq, gte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createDigiflazzTransaction } from '@/lib/digiflazz';
import { createOrderCode } from '@/lib/order-codes';
import { getDatabase } from '@/lib/server/db/client';
import { balanceLedger, products, transactions, users } from '@/lib/server/db/schema';
import { applyBalanceDelta } from '@/lib/server/wallet';
import { getDigiflazzConfig } from '@/lib/server/integration-settings';
import { validateOrderDestination } from '@/lib/order-input-validation';
import { isValidTransactionPin } from '@/lib/server/transaction-pin-core';
import { verifyAndRecordTransactionPin } from '@/lib/server/transaction-pin';

type OrderServiceBody = {
  error?: string;
  message?: string;
  transaction?: typeof transactions.$inferSelect;
  balance?: number;
};

export type CreateBalanceOrderInput = {
  idempotencyKey: string;
  productId: string;
  destination: string;
  customerName?: string;
  serverZoneId?: string;
  transactionPin?: string;
  user: {
    id: string;
    phoneNumber?: string | null;
    role: string;
  };
};

export type CreateBalanceOrderResult = {
  status: number;
  body: OrderServiceBody;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProviderResponse(
  value: unknown,
): value is {
  data: {
    ref_id: string;
    status: string;
    message: string;
    rc: string;
    sn?: string;
  };
} {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  return (
    typeof value.data.ref_id === 'string' &&
    typeof value.data.status === 'string' &&
    typeof value.data.message === 'string' &&
    typeof value.data.rc === 'string' &&
    (value.data.sn === undefined || typeof value.data.sn === 'string')
  );
}

async function getDatabaseBalance(userId: string) {
  const rows = await getDatabase()
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.balance ?? 0;
}

export async function createBalanceOrder(
  input: CreateBalanceOrderInput,
): Promise<CreateBalanceOrderResult> {
  if (input.user.role === 'user' || input.user.role === 'agent') {
    if (!isValidTransactionPin(input.transactionPin)) {
      return { status: 400, body: { error: 'INVALID_TRANSACTION_PIN' } };
    }

    const pinVerification = await verifyAndRecordTransactionPin(
      input.user.id,
      input.transactionPin,
    );
    if (pinVerification === 'not_set') {
      return { status: 409, body: { error: 'TRANSACTION_PIN_NOT_SET' } };
    }
    if (pinVerification === 'locked') {
      return { status: 429, body: { error: 'TRANSACTION_PIN_LOCKED' } };
    }
    if (pinVerification === 'invalid') {
      return { status: 403, body: { error: 'INVALID_TRANSACTION_PIN' } };
    }
  }

  let vendorConfig: Awaited<ReturnType<typeof getDigiflazzConfig>>;
  try {
    vendorConfig = await getDigiflazzConfig();
  } catch (error) {
    console.error(
      '[ORDER_VENDOR_SETTINGS_UNAVAILABLE]',
      error instanceof Error ? error.message : 'Unknown settings error',
    );
    return { status: 503, body: { error: 'VENDOR_SETTINGS_UNAVAILABLE' } };
  }

  const { username, apiKey, mode, enableRealTransactions } = vendorConfig;
  if (!username || !apiKey || (mode !== 'sandbox' && mode !== 'production')) {
    return {
      status: 503,
      body: {
        error: 'VENDOR_NOT_CONFIGURED',
        message: 'Wallet purchases are unavailable until Digiflazz is configured server-side.',
      },
    };
  }

  const db = getDatabase();
  const product = await db
    .select()
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.status, 'active')))
    .limit(1)
    .then((rows) => rows[0]);

  if (!product) {
    return { status: 404, body: { error: 'PRODUCT_NOT_FOUND' } };
  }
  const destinationError = validateOrderDestination(
    product.category,
    product.operator,
    input.destination,
    input.serverZoneId,
  );
  if (destinationError) {
    return { status: 400, body: { error: destinationError } };
  }
  if (product.vendor !== 'Digiflazz') {
    return { status: 503, body: { error: 'PRODUCT_VENDOR_NOT_CONFIGURED' } };
  }
  if (mode === 'production' && !enableRealTransactions) {
    return { status: 503, body: { error: 'PRODUCTION_TRANSACTIONS_DISABLED' } };
  }

  const price = input.user.role === 'agent'
    ? product.sellPriceAgent
    : product.sellPriceUser;
  if (
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    !Number.isSafeInteger(product.basePrice)
  ) {
    return { status: 503, body: { error: 'INVALID_PRODUCT_PRICE' } };
  }

  const referenceId = createOrderCode('PAY');
  const transactionId = randomUUID();
  const destination = input.destination.trim();
  const serverZoneId = input.serverZoneId?.trim() || null;
  const fullDestination = serverZoneId
    ? `${destination} (${serverZoneId})`
    : destination;

  let createdTransaction:
    | (typeof transactions.$inferSelect)
    | undefined;

  try {
    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.idempotencyKey, input.idempotencyKey))
        .limit(1)
        .then((rows) => rows[0]);

      if (existing) {
        const legacyGameDestination = existing.category === 'game' && !existing.serverZoneId
          ? existing.destination.match(/^(.*) \(([^()]*)\)$/)
          : null;
        const sameDestination =
          existing.destination === destination && existing.serverZoneId === serverZoneId ||
          Boolean(
            legacyGameDestination &&
            legacyGameDestination[1] === destination &&
            legacyGameDestination[2] === serverZoneId,
          );
        if (
          existing.userId !== input.user.id ||
          existing.productId !== product.id ||
          !sameDestination
        ) {
          return { conflict: true as const, transaction: existing };
        }
        return { conflict: false as const, transaction: existing, duplicate: true };
      }

      const updatedUsers = await tx
        .update(users)
        .set({
          balance: sql`${users.balance} - ${price}`,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, input.user.id), gte(users.balance, price)))
        .returning({ balance: users.balance });

      if (!updatedUsers[0]) {
        return { insufficientBalance: true as const };
      }

      const inserted = await tx
        .insert(transactions)
        .values({
          id: transactionId,
          referenceId,
          idempotencyKey: input.idempotencyKey,
          userId: input.user.id,
          customerPhone: input.user.phoneNumber ?? null,
          productId: product.id,
          productName: product.name,
          category: product.category,
          operator: product.operator,
          destination,
          serverZoneId,
          customerName: input.customerName,
          amount: price,
          profit: price - product.basePrice,
          status: 'pending',
          paymentMethod: 'balance',
          vendorResponse: {
            code: '',
            message: 'Menunggu respons Digiflazz.',
            rc: '',
            rawTime: new Date().toISOString(),
            reconciliation: {
              buyerSkuCode: product.vendorCode,
              customerNo: serverZoneId
                ? `${destination}.${serverZoneId}`
                : destination,
              mode,
            },
          },
        })
        .onConflictDoNothing({ target: transactions.idempotencyKey })
        .returning();

      if (!inserted[0]) {
        await tx
          .update(users)
          .set({
            balance: sql`${users.balance} + ${price}`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, input.user.id));

        const raced = await tx
          .select()
          .from(transactions)
          .where(eq(transactions.idempotencyKey, input.idempotencyKey))
          .limit(1)
          .then((rows) => rows[0]);
        if (!raced) throw new Error('Idempotency conflict without an existing order');
        const legacyGameDestination = raced.category === 'game' && !raced.serverZoneId
          ? raced.destination.match(/^(.*) \(([^()]*)\)$/)
          : null;
        const sameDestination =
          raced.destination === destination && raced.serverZoneId === serverZoneId ||
          Boolean(
            legacyGameDestination &&
            legacyGameDestination[1] === destination &&
            legacyGameDestination[2] === serverZoneId,
          );
        return {
          conflict:
            raced.userId !== input.user.id ||
            raced.productId !== product.id ||
            !sameDestination,
          transaction: raced,
          duplicate: true,
        };
      }

      const balanceAfter = updatedUsers[0].balance;
      const balanceBefore = balanceAfter + price;
      await tx.insert(balanceLedger).values({
        id: randomUUID(),
        idempotencyKey: `debit:${input.idempotencyKey}`,
        userId: input.user.id,
        type: 'debit',
        amount: price,
        balanceBefore,
        balanceAfter,
        reference: referenceId,
        note: `Pembelian ${product.name} ke ${fullDestination}`,
      });

      return {
        conflict: false as const,
        transaction: inserted[0],
        duplicate: false,
      };
    });

    if ('insufficientBalance' in result && result.insufficientBalance) {
      return { status: 409, body: { error: 'INSUFFICIENT_BALANCE' } };
    }

    if ('conflict' in result && result.conflict) {
      return { status: 409, body: { error: 'IDEMPOTENCY_KEY_REUSED' } };
    }

    createdTransaction = result.transaction;
    if (result.duplicate) {
      const balance = await getDatabaseBalance(input.user.id);
      return {
        status: createdTransaction.status === 'pending' ? 202 : 200,
        body: { transaction: createdTransaction, balance },
      };
    }
  } catch (error) {
    console.error(
      '[ORDER_CREATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return { status: 503, body: { error: 'ORDER_COULD_NOT_BE_CREATED' } };
  }

  try {
    const providerResponse: unknown = await createDigiflazzTransaction(
      { username, apiKey, mode },
      {
        buyerSkuCode: product.vendorCode,
        customerNo: serverZoneId
          ? `${destination}.${serverZoneId}`
          : destination,
        refId: referenceId,
      },
    );

    if (
      !isProviderResponse(providerResponse) ||
      providerResponse.data.ref_id !== referenceId
    ) {
      return {
        status: 202,
        body: {
          transaction: createdTransaction,
          error: 'VENDOR_RESPONSE_UNCLEAR',
        },
      };
    }

    const response = providerResponse.data;
    const providerStatus = response.status.toLowerCase();
    const status =
      providerStatus === 'sukses' && response.rc === '00'
        ? 'success'
        : providerStatus === 'gagal'
          ? 'failed'
          : 'pending';
    const vendorResponse = {
      code: response.rc,
      message: response.message.slice(0, 500),
      rc: response.rc,
      rawTime: new Date().toISOString(),
      reconciliation: createdTransaction.vendorResponse?.reconciliation,
    };

    if (status === 'failed') {
      createdTransaction = await getDatabase().transaction(async (tx) => {
        const refundKey = `refund:${referenceId}`;
        const existingRefund = await tx
          .select({ id: balanceLedger.id })
          .from(balanceLedger)
          .where(eq(balanceLedger.idempotencyKey, refundKey))
          .limit(1);
        if (!existingRefund[0]) {
          const walletResult = await applyBalanceDelta(tx, {
            idempotencyKey: refundKey,
            userId: input.user.id,
            type: 'credit',
            amount: price,
            reference: referenceId,
            note: `Refund gagal Digiflazz ${product.name}`,
          });
          if ('error' in walletResult) throw new Error(walletResult.error);
        }

        const updated = await tx
          .update(transactions)
          .set({ status: 'failed', vendorResponse, updatedAt: new Date() })
          .where(eq(transactions.id, createdTransaction!.id))
          .returning()
          .then((rows) => rows[0]);
        if (!updated) throw new Error('Failed to update order status');
        return updated;
      });
    } else {
      createdTransaction = await getDatabase()
        .update(transactions)
        .set({
          status,
          sn: status === 'success' ? response.sn ?? null : null,
          vendorResponse,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, createdTransaction.id))
        .returning()
        .then((rows) => rows[0]);
    }

    const balance = await getDatabaseBalance(input.user.id);
    return {
      status: status === 'pending' ? 202 : status === 'failed' ? 502 : 200,
      body: { transaction: createdTransaction, balance },
    };
  } catch (error) {
    console.error(
      '[VENDOR_ORDER_OUTCOME_UNCLEAR]',
      error instanceof Error ? error.message : 'Unknown provider error',
    );
    return {
      status: 202,
      body: {
        transaction: createdTransaction,
        error: 'ORDER_STATUS_PENDING',
        balance: await getDatabaseBalance(input.user.id),
      },
    };
  }
}
