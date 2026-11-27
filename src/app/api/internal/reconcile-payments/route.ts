import { and, asc, eq, isNotNull, lt, lte, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { isInternalJobAuthorized } from '@/lib/server/internal-job-auth';
import { getDigiflazzConfig } from '@/lib/server/integration-settings';
import type { DigiflazzConfig } from '@/lib/digiflazz';
import {
  digiflazzReconciliationCooldownMs,
  listReconciliationCandidates,
  reconcileBalanceOrder,
  tokoVoucherReconciliationCooldownMs,
} from '@/lib/server/orders/reconcile-balance-order';
import { getDatabase } from '@/lib/server/db/client';
import { acquireRedisLease } from '@/lib/server/redis';
import {
  qrislyDepositReconciliationCooldownMs,
  refreshQrislyDeposit,
} from '@/lib/server/qrisly-deposits';
import { refreshQrislyOrder } from '@/lib/server/qrisly-orders';
import { deposits, invoices, transactions } from '@/lib/server/db/schema';

export const runtime = 'nodejs';

const batchSize = 25;
const concurrency = 4;

export async function POST(request: NextRequest) {
  if (
    !process.env.PAYMENT_RECONCILER_SECRET ||
    Buffer.byteLength(process.env.PAYMENT_RECONCILER_SECRET) < 32
  ) {
    return NextResponse.json(
      { error: 'PAYMENT_RECONCILER_NOT_CONFIGURED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!isInternalJobAuthorized(request)) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const lease = await acquireRedisLease('ppob:lock:payment-reconciler', 5 * 60_000);
  if (lease && !lease.acquired) {
    return NextResponse.json(
      { skipped: 'RECONCILIATION_ALREADY_RUNNING' },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  try {
    return await runReconciliation();
  } finally {
    await lease?.release?.();
  }
}

async function runReconciliation() {
  const [qrislyCandidates, qrislyDepositCandidates, balanceOrderCandidates] = await Promise.all([
    getDatabase()
      .select({ id: invoices.id })
      .from(invoices)
      .where(or(
        and(
          eq(invoices.paymentMethod, 'qrisly'),
          eq(invoices.paymentStatus, 'unpaid'),
          isNotNull(invoices.providerReference),
        ),
        and(
          eq(invoices.paymentMethod, 'qrisly'),
          eq(invoices.paymentStatus, 'unpaid'),
          lte(invoices.expiresAt, new Date()),
        ),
        and(
          eq(invoices.paymentMethod, 'qrisly'),
          eq(invoices.paymentStatus, 'paid'),
          eq(invoices.transactionStatus, 'processing'),
        ),
      ))
      .orderBy(asc(invoices.updatedAt))
      .limit(batchSize),
    getDatabase()
      .select({ id: deposits.id })
      .from(deposits)
      .where(and(
        eq(deposits.type, 'qrisly'),
        eq(deposits.status, 'pending'),
        isNotNull(deposits.providerReference),
        lt(
          deposits.updatedAt,
          new Date(Date.now() - qrislyDepositReconciliationCooldownMs),
        ),
      ))
      .orderBy(asc(deposits.updatedAt))
      .limit(batchSize),
    listReconciliationCandidates(
      batchSize,
      new Date(Date.now() - digiflazzReconciliationCooldownMs),
      new Date(Date.now() - tokoVoucherReconciliationCooldownMs),
    ),
  ]);
  let digiflazzConfig: Awaited<ReturnType<typeof getDigiflazzConfig>> | null = null;
  if (balanceOrderCandidates.some(({ vendor }) => vendor === 'Digiflazz')) {
    try {
      digiflazzConfig = await getDigiflazzConfig();
    } catch (error) {
      console.error(
        '[DIGIFLAZZ_RECONCILIATION_CONFIG_FAILED]',
        error instanceof Error ? error.message : 'Unknown settings error',
      );
    }
  }

  let processed = 0;
  let failed = 0;
  const reconcile = async (
    id: string,
    type: 'qrisly' | 'qrisly-deposit' | 'balance-order',
  ) => {
    try {
      if (type === 'qrisly') {
        return await refreshQrislyOrder(id);
      }
      if (type === 'qrisly-deposit') {
        return await refreshQrislyDeposit(id);
      }
      let config: DigiflazzConfig | undefined;
      if (digiflazzConfig?.username && digiflazzConfig.apiKey) {
        const mode = digiflazzConfig.mode;
        if (mode === 'sandbox' || mode === 'production') {
          config = {
            username: digiflazzConfig.username,
            apiKey: digiflazzConfig.apiKey,
            mode,
          };
        }
      }
      return await reconcileBalanceOrder(id, config);
    } catch (error) {
      const table = type === 'qrisly'
        ? invoices
        : type === 'qrisly-deposit'
          ? deposits
          : transactions;
      await getDatabase()
        .update(table)
        .set({ updatedAt: new Date() })
        .where(eq(table.id, id));
      console.error(
        type === 'qrisly'
          ? '[PAYMENT_RECONCILIATION_ORDER_FAILED]'
          : '[BALANCE_ORDER_RECONCILIATION_FAILED]',
        id,
        error instanceof Error ? error.message : 'Unknown reconciliation error',
      );
      throw error;
    }
  };

  const candidates: {
    id: string;
    type: 'qrisly' | 'qrisly-deposit' | 'balance-order';
  }[] = [];
  for (
    let offset = 0;
    candidates.length < batchSize &&
    (
      offset < qrislyCandidates.length ||
      offset < qrislyDepositCandidates.length ||
      offset < balanceOrderCandidates.length
    );
    offset += 1
  ) {
    if (qrislyCandidates[offset] && candidates.length < batchSize) {
      candidates.push({ id: qrislyCandidates[offset].id, type: 'qrisly' });
    }
    if (qrislyDepositCandidates[offset] && candidates.length < batchSize) {
      candidates.push({
        id: qrislyDepositCandidates[offset].id,
        type: 'qrisly-deposit',
      });
    }
    if (balanceOrderCandidates[offset] && candidates.length < batchSize) {
      candidates.push({ id: balanceOrderCandidates[offset].id, type: 'balance-order' });
    }
  }
  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    const batch = candidates.slice(offset, offset + concurrency);
    const results = await Promise.allSettled(
      batch.map(({ id, type }) => reconcile(id, type)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) processed += 1;
      else failed += 1;
    }
  }

  return NextResponse.json(
    {
      considered: candidates.length,
      processed,
      failed,
      qrisly: candidates.filter(({ type }) => type === 'qrisly').length,
      qrislyDeposits: candidates.filter(({ type }) => type === 'qrisly-deposit').length,
      balanceOrders: candidates.filter(({ type }) => type === 'balance-order').length,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
