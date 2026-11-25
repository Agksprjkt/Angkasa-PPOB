import 'server-only';

import { and, eq, gte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createDigiflazzTransaction } from '@/lib/digiflazz';
import { createOrderCode } from '@/lib/order-codes';
import { getDatabase } from '@/lib/server/db/client';
import {
  balanceLedger,
  flashSaleReservations,
  products,
  transactions,
  users,
} from '@/lib/server/db/schema';
import { applyBalanceDelta } from '@/lib/server/wallet';
import { getDigiflazzConfig, getTokoVoucherConfig, getVendorRuntimeConfig } from '@/lib/server/integration-settings';
import { isOrderableVendor, isVendorEnabled } from '@/lib/vendor-registry';
import { createTokoVoucherTransaction } from '@/lib/tokovoucher';
import { mapTokoVoucherStatus } from '@/lib/tokovoucher-protocol';
import { validateOrderDestination } from '@/lib/order-input-validation';
import {
  buildDigiflazzCustomerNo,
  mapDigiflazzStatus,
  readDigiflazzTransactionResponse,
} from '@/lib/digiflazz-protocol';
import { isValidTransactionPin } from '@/lib/server/transaction-pin-core';
import { verifyAndRecordTransactionPin } from '@/lib/server/transaction-pin';
import {
  createFlashSaleReservation,
  releaseFlashSaleCapacity,
  reserveFlashSaleCapacity,
  settleFlashSaleReservation,
} from '@/lib/server/flash-sales';
import { previewVoucherForOrder, claimVoucherSlot, settleVoucherForTransaction } from '@/lib/server/vouchers';

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
  flashSaleOfferId?: string;
  flashSalePriceExpected?: number;
  voucherCode?: string;
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

async function getDatabaseBalance(userId: string) {
  const rows = await getDatabase()
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.balance ?? 0;
}

// Only the two switches matter here; the full runtime config also carries
// webhook secrets that this path has no use for.
async function getVendorSwitchValues() {
  const config = await getVendorRuntimeConfig();
  return {
    digiflazzEnabled: config.digiflazzEnabled,
    tokovoucherEnabled: config.tokovoucherEnabled,
  };
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
  if (!isOrderableVendor(product.vendor)) {
    return { status: 503, body: { error: 'PRODUCT_VENDOR_NOT_CONFIGURED' } };
  }
  // Checked before any balance movement: a switched-off vendor must not take new
  // orders. Pending orders are settled elsewhere, so they keep working.
  if (!isVendorEnabled(product.vendor, await getVendorSwitchValues())) {
    return {
      status: 409,
      body: {
        error: 'VENDOR_DISABLED',
        message: `${product.vendor} sedang dinonaktifkan oleh admin.`,
      },
    };
  }

  // Credentials are resolved after the product is known, because each vendor has
  // its own configuration and its own real-transaction switch.
  let vendorConfig: Awaited<ReturnType<typeof getDigiflazzConfig>>;
  let tokoVoucherConfig: Awaited<ReturnType<typeof getTokoVoucherConfig>> | null = null;
  try {
    if (product.vendor === 'TokoVoucher') {
      tokoVoucherConfig = await getTokoVoucherConfig();
      vendorConfig = {
        username: '',
        apiKey: '',
        mode: 'sandbox' as const,
        enableRealTransactions: false,
      };
    } else {
      vendorConfig = await getDigiflazzConfig();
    }
  } catch (error) {
    console.error(
      '[ORDER_VENDOR_SETTINGS_UNAVAILABLE]',
      error instanceof Error ? error.message : 'Unknown settings error',
    );
    return { status: 503, body: { error: 'VENDOR_SETTINGS_UNAVAILABLE' } };
  }

  const { username, apiKey, mode, enableRealTransactions } = vendorConfig;
  if (product.vendor === 'Digiflazz') {
    if (!username || !apiKey || (mode !== 'sandbox' && mode !== 'production')) {
      return {
        status: 503,
        body: {
          error: 'VENDOR_NOT_CONFIGURED',
          message: 'Wallet purchases are unavailable until Digiflazz is configured server-side.',
        },
      };
    }
    if (mode === 'production' && !enableRealTransactions) {
      return { status: 503, body: { error: 'PRODUCTION_TRANSACTIONS_DISABLED' } };
    }
  } else {
    if (!tokoVoucherConfig?.memberCode || !tokoVoucherConfig.secret) {
      return {
        status: 503,
        body: {
          error: 'VENDOR_NOT_CONFIGURED',
          message: 'Wallet purchases are unavailable until TokoVoucher is configured server-side.',
        },
      };
    }
    if (tokoVoucherConfig.mode === 'production' && !tokoVoucherConfig.enableRealTransactions) {
      return { status: 503, body: { error: 'PRODUCTION_TRANSACTIONS_DISABLED' } };
    }
  }

  const regularPrice = input.user.role === 'agent'
    ? product.sellPriceAgent
    : product.sellPriceUser;
  if (
    !Number.isSafeInteger(regularPrice) ||
    regularPrice <= 0 ||
    !Number.isSafeInteger(product.basePrice)
  ) {
    return { status: 503, body: { error: 'INVALID_PRODUCT_PRICE' } };
  }
  if (
    Boolean(input.flashSaleOfferId) !== (input.flashSalePriceExpected !== undefined) ||
    (
      input.flashSalePriceExpected !== undefined &&
      (!Number.isSafeInteger(input.flashSalePriceExpected) || input.flashSalePriceExpected <= 0)
    )
  ) {
    return { status: 400, body: { error: 'INVALID_FLASH_SALE' } };
  }

  const referenceId = createOrderCode('PAY');
  const transactionId = randomUUID();
  const destination = input.destination.trim();
  const serverZoneId = input.serverZoneId?.trim() || null;
  const fullDestination = serverZoneId
    ? `${destination} (${serverZoneId})`
    : destination;
  let price = regularPrice;

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
        const existingReservation = await tx
          .select({ offerId: flashSaleReservations.offerId })
          .from(flashSaleReservations)
          .where(eq(flashSaleReservations.transactionId, existing.id))
          .limit(1)
          .then((rows) => rows[0]);
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
          !sameDestination ||
          existingReservation?.offerId !== (input.flashSaleOfferId ?? undefined)
        ) {
          return { conflict: true as const, transaction: existing };
        }
        return { conflict: false as const, transaction: existing, duplicate: true };
      }

      const now = new Date();
      let saleOfferId: string | null = null;
      let orderPrice = regularPrice;
      if (input.flashSaleOfferId) {
        const expectedPrice = input.flashSalePriceExpected;
        if (expectedPrice === undefined) {
          return { flashSaleError: 'FLASH_SALE_UNAVAILABLE' as const };
        }
        const reservation = await reserveFlashSaleCapacity(tx, {
          offerId: input.flashSaleOfferId,
          productId: product.id,
          expectedPrice,
          now,
          role: input.user.role === 'agent' ? 'agent' : input.user.role === 'admin' ? 'admin' : 'user',
        });
        if ('error' in reservation) {
          return { flashSaleError: reservation.error };
        }
        saleOfferId = reservation.offerId;
        orderPrice = reservation.salePrice;
      }

      // Voucher applies on top of any flash-sale price. Validation happens before
      // the order insert because the redemption row references the order; the
      // quota slot is claimed right after the order exists.
      let voucherCode: string | null = null;
      let discountAmount = 0;
      let voucherClaim: { voucherId: string; code: string; discountAmount: number } | null = null;
      if (input.voucherCode) {
        const voucherResult = await previewVoucherForOrder(tx, {
          code: input.voucherCode,
          basePrice: orderPrice,
          userId: input.user.id,
          now,
        });
        if (!voucherResult.ok) {
          if (saleOfferId) await releaseFlashSaleCapacity(tx, saleOfferId, now);
          return { voucherError: voucherResult.error };
        }
        voucherCode = voucherResult.code;
        discountAmount = voucherResult.discountAmount;
        orderPrice = voucherResult.finalPrice;
        voucherClaim = {
          voucherId: voucherResult.voucherId,
          code: voucherResult.code,
          discountAmount: voucherResult.discountAmount,
        };
      }

      const updatedUsers = await tx
        .update(users)
        .set({
          balance: sql`${users.balance} - ${orderPrice}`,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, input.user.id), gte(users.balance, orderPrice)))
        .returning({ balance: users.balance });

      if (!updatedUsers[0]) {
        if (saleOfferId) await releaseFlashSaleCapacity(tx, saleOfferId, now);
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
          amount: orderPrice,
          profit: orderPrice - product.basePrice,
          status: 'pending',
          paymentMethod: 'balance',
          voucherCode,
          discountAmount,
          vendorResponse: {
            code: '',
            message: `Menunggu respons ${product.vendor}.`,
            rc: '',
            rawTime: new Date().toISOString(),
            reconciliation: {
              buyerSkuCode: product.vendorCode,
              customerNo: buildDigiflazzCustomerNo(destination, serverZoneId).customerNo,
              // The reconciler needs the vendor to know whom to ask.
              vendor: product.vendor,
              mode: product.vendor === 'TokoVoucher'
                ? tokoVoucherConfig!.mode
                : mode === 'production' ? 'production' as const : 'sandbox' as const,
            },
          },
        })
        .onConflictDoNothing({ target: transactions.idempotencyKey })
        .returning();

      if (!inserted[0]) {
        await tx
          .update(users)
          .set({
            balance: sql`${users.balance} + ${orderPrice}`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, input.user.id));
        if (saleOfferId) await releaseFlashSaleCapacity(tx, saleOfferId, now);

        const raced = await tx
          .select()
          .from(transactions)
          .where(eq(transactions.idempotencyKey, input.idempotencyKey))
          .limit(1)
          .then((rows) => rows[0]);
        if (!raced) throw new Error('Idempotency conflict without an existing order');
        const racedReservation = await tx
          .select({ offerId: flashSaleReservations.offerId })
          .from(flashSaleReservations)
          .where(eq(flashSaleReservations.transactionId, raced.id))
          .limit(1)
          .then((rows) => rows[0]);
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
            !sameDestination ||
            racedReservation?.offerId !== (input.flashSaleOfferId ?? undefined),
          transaction: raced,
          duplicate: true,
        };
      }

      const balanceAfter = updatedUsers[0].balance;
      const balanceBefore = balanceAfter + orderPrice;
      await tx.insert(balanceLedger).values({
        id: randomUUID(),
        idempotencyKey: `debit:${input.idempotencyKey}`,
        userId: input.user.id,
        type: 'debit',
        amount: orderPrice,
        balanceBefore,
        balanceAfter,
        reference: referenceId,
        note: `Pembelian ${product.name} ke ${fullDestination}`,
      });
      if (saleOfferId) {
        await createFlashSaleReservation(
          tx,
          saleOfferId,
          { transactionId: inserted[0].id },
          null,
          now,
        );
      }
      if (voucherClaim) {
        const claimed = await claimVoucherSlot(tx, {
          ...voucherClaim,
          userId: input.user.id,
          reference: { transactionId: inserted[0].id },
          expiresAt: null,
          now,
        });
        // The quota was validated moments ago inside this transaction, so a lost
        // race here means the row changed underneath us; fail loudly instead of
        // charging a price the voucher did not earn.
        if (!claimed) throw new Error('VOUCHER_QUOTA_EXHAUSTED');
      }

      return {
        conflict: false as const,
        transaction: inserted[0],
        duplicate: false,
        price: orderPrice,
      };
    });

    if ('insufficientBalance' in result && result.insufficientBalance) {
      return { status: 409, body: { error: 'INSUFFICIENT_BALANCE' } };
    }

    if ('flashSaleError' in result) {
      return { status: 409, body: { error: result.flashSaleError } };
    }

    if ('voucherError' in result) {
      return { status: 409, body: { error: result.voucherError } };
    }

    if ('conflict' in result && result.conflict) {
      return { status: 409, body: { error: 'IDEMPOTENCY_KEY_REUSED' } };
    }

    createdTransaction = result.transaction;
    if ('price' in result && typeof result.price === 'number') price = result.price;
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
    // Both vendors are normalised into the same shape so the settle/refund logic
    // below stays identical regardless of who fulfils the order.
    let status: 'success' | 'pending' | 'failed';
    let vendorMessage: string;
    let vendorCode: string;
    let vendorSn: string | null;
    try {
      if (product.vendor === 'TokoVoucher') {
        const response = await createTokoVoucherTransaction(
          {
            memberCode: tokoVoucherConfig!.memberCode,
            secret: tokoVoucherConfig!.secret,
            defaultSignature: tokoVoucherConfig!.defaultSignature,
            mode: tokoVoucherConfig!.mode,
          },
          {
            refId: referenceId,
            vendorCode: product.vendorCode,
            destination,
            serverZoneId,
          },
        );
        if (response.refId !== referenceId) {
          return {
            status: 202,
            body: { transaction: createdTransaction, error: 'VENDOR_RESPONSE_UNCLEAR' },
          };
        }
        status = mapTokoVoucherStatus(response.status);
        vendorMessage = response.message;
        vendorCode = response.status;
        vendorSn = response.sn || null;
      } else {
        const providerResponse: unknown = await createDigiflazzTransaction(
          { username: username ?? '', apiKey: apiKey ?? '', mode: mode === 'production' ? 'production' : 'sandbox' },
          {
            buyerSkuCode: product.vendorCode,
            customerNo: buildDigiflazzCustomerNo(destination, serverZoneId).customerNo,
            refId: referenceId,
          },
        );

        const response = readDigiflazzTransactionResponse(providerResponse);
        if (!response || response.refId !== referenceId) {
          return {
            status: 202,
            body: { transaction: createdTransaction, error: 'VENDOR_RESPONSE_UNCLEAR' },
          };
        }
        status = mapDigiflazzStatus(response.status, response.rc);
        vendorMessage = response.message;
        vendorCode = response.rc;
        vendorSn = status === 'success' ? response.sn ?? null : null;
      }
    } catch (error) {
      // Both vendors: an HTTP error or timeout leaves the order pending so the
      // webhook or reconciler can still settle it. Never fail-and-refund here.
      throw error;
    }

    const vendorResponse = {
      code: vendorCode,
      message: vendorMessage.slice(0, 500),
      rc: vendorCode,
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
        await settleFlashSaleReservation(
          tx,
          { transactionId: updated.id },
          'released',
          new Date(),
        );
        await settleVoucherForTransaction(tx, updated.id, 'released', new Date());
        return updated;
      });
    } else {
      createdTransaction = await getDatabase().transaction(async (tx) => {
        const updated = await tx
          .update(transactions)
          .set({
            status,
            sn: status === 'success' ? vendorSn : null,
            vendorResponse,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, createdTransaction!.id))
          .returning()
          .then((rows) => rows[0]);
        if (updated && status === 'success') {
          await settleFlashSaleReservation(
            tx,
            { transactionId: updated.id },
            'consumed',
            new Date(),
          );
          await settleVoucherForTransaction(tx, updated.id, 'consumed', new Date());
        }
        return updated;
      });
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
