import 'server-only';

import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '@/lib/server/db/client';
import { voucherRedemptions, vouchers } from '@/lib/server/db/schema';
import {
  evaluateVoucher,
  normalizeVoucherCode,
  type VoucherEvaluation,
  type VoucherRuleFields,
} from '@/lib/voucher-core';

// Accepts a transaction or the plain database handle: the read-only validation
// path has no transaction to reuse.
type VoucherTransaction = Pick<
  Parameters<Parameters<ReturnType<typeof getDatabase>['transaction']>[0]>[0],
  'select' | 'insert' | 'update' | 'delete'
>;

type OrderReference =
  | { invoiceId: string; transactionId?: never }
  | { invoiceId?: never; transactionId: string };

function toRuleFields(row: typeof vouchers.$inferSelect): VoucherRuleFields {
  return {
    code: row.code,
    discountType: row.discountType,
    discountValue: row.discountValue,
    maxDiscount: row.maxDiscount,
    minOrder: row.minOrder,
    quotaLimit: row.quotaLimit,
    quantityUsed: row.quantityUsed,
    perUserLimit: row.perUserLimit,
    startsAt: row.startsAt ?? null,
    endsAt: row.endsAt ?? null,
    enabled: row.enabled,
  };
}

// Counts only orders that actually hold or held a slot. A released redemption
// frees the user's allowance again, matching the quota refund policy.
async function countUserRedemptions(
  db: VoucherTransaction,
  voucherId: string,
  userId: string | null,
) {
  if (!userId) return 0;
  const rows = await db
    .select({ id: voucherRedemptions.id })
    .from(voucherRedemptions)
    .where(and(
      eq(voucherRedemptions.voucherId, voucherId),
      eq(voucherRedemptions.userId, userId),
      inArray(voucherRedemptions.status, ['reserved', 'consumed']),
    ));
  return rows.length;
}

export type VoucherValidation =
  | { ok: true; voucherId: string; code: string; discountAmount: number; finalPrice: number }
  | { ok: false; error: Exclude<VoucherEvaluation, { ok: true }>['error'] };

// Read-only check used by the public validation endpoint: it must never reserve
// a slot, because the buyer may never finish checkout.
export async function validateVoucherCode(input: {
  code: string;
  basePrice: number;
  userId: string | null;
  now?: Date;
}): Promise<VoucherValidation> {
  const code = normalizeVoucherCode(input.code);
  const db = getDatabase();
  const row = await db
    .select()
    .from(vouchers)
    .where(eq(vouchers.code, code))
    .limit(1)
    .then((rows) => rows[0]);

  const evaluation = evaluateVoucher({
    voucher: row ? toRuleFields(row) : null,
    basePrice: input.basePrice,
    now: input.now ?? new Date(),
    userUsageCount: row ? await countUserRedemptions(db, row.id, input.userId) : 0,
  });

  if (!evaluation.ok) return evaluation;
  return {
    ok: true,
    voucherId: row!.id,
    code: row!.code,
    discountAmount: evaluation.discountAmount,
    finalPrice: evaluation.finalPrice,
  };
}

// Validation and slot claiming are separate because the redemption row carries a
// foreign key to the order: the order row must exist first. Call this to learn
// the discount, insert the order, then claimVoucherSlot to consume a quota slot.
export async function previewVoucherForOrder(
  tx: VoucherTransaction,
  input: {
    code: string;
    basePrice: number;
    userId: string | null;
    now: Date;
  },
): Promise<VoucherValidation> {
  const code = normalizeVoucherCode(input.code);
  const row = await tx
    .select()
    .from(vouchers)
    .where(eq(vouchers.code, code))
    .limit(1)
    .then((rows) => rows[0]);

  const evaluation = evaluateVoucher({
    voucher: row ? toRuleFields(row) : null,
    basePrice: input.basePrice,
    now: input.now,
    userUsageCount: row ? await countUserRedemptions(tx, row.id, input.userId) : 0,
  });
  if (!evaluation.ok) return evaluation;
  return {
    ok: true,
    voucherId: row!.id,
    code: row!.code,
    discountAmount: evaluation.discountAmount,
    finalPrice: evaluation.finalPrice,
  };
}

export async function claimVoucherSlot(
  tx: VoucherTransaction,
  input: {
    voucherId: string;
    code: string;
    discountAmount: number;
    userId: string | null;
    reference: OrderReference;
    expiresAt: Date | null;
    now: Date;
  },
) {
  const [claimed] = await tx
    .update(vouchers)
    .set({
      quantityUsed: sql`${vouchers.quantityUsed} + 1`,
      updatedAt: input.now,
    })
    .where(and(
      eq(vouchers.id, input.voucherId),
      eq(vouchers.enabled, true),
      sql`(${vouchers.quotaLimit} IS NULL OR ${vouchers.quantityUsed} < ${vouchers.quotaLimit})`,
    ))
    .returning({ id: vouchers.id });
  if (!claimed) return false;

  await tx.insert(voucherRedemptions).values({
    id: randomUUID(),
    voucherId: claimed.id,
    userId: input.userId,
    invoiceId: input.reference.invoiceId ?? null,
    transactionId: input.reference.transactionId ?? null,
    code: input.code,
    discountAmount: input.discountAmount,
    status: 'reserved',
    expiresAt: input.expiresAt,
    createdAt: input.now,
    updatedAt: input.now,
  });
  return true;
}

export async function settleVoucherUsage(
  tx: VoucherTransaction,
  reference: OrderReference,
  outcome: 'consumed' | 'released',
  now: Date,
) {
  const match = reference.invoiceId
    ? eq(voucherRedemptions.invoiceId, reference.invoiceId)
    : reference.transactionId
      ? eq(voucherRedemptions.transactionId, reference.transactionId)
      : null;
  if (!match) throw new Error('VOUCHER_REDEMPTION_REFERENCE_REQUIRED');

  const [redemption] = await tx
    .update(voucherRedemptions)
    .set({ status: outcome, updatedAt: now })
    .where(and(match, eq(voucherRedemptions.status, 'reserved')))
    .returning({ voucherId: voucherRedemptions.voucherId });
  if (!redemption) return false;

  // Releasing hands the slot back; consuming keeps it spent.
  if (outcome === 'released') {
    await tx
      .update(vouchers)
      .set({
        quantityUsed: sql`${vouchers.quantityUsed} - 1`,
        updatedAt: now,
      })
      .where(and(eq(vouchers.id, redemption.voucherId), gte(vouchers.quantityUsed, 1)));
  }
  return true;
}

export async function settleVoucherForTransaction(
  tx: VoucherTransaction,
  transactionId: string,
  outcome: 'consumed' | 'released',
  now: Date,
) {
  return settleVoucherUsage(tx, { transactionId }, outcome, now);
}

export async function expireVoucherForInvoice(
  tx: VoucherTransaction,
  invoiceId: string,
  now: Date,
) {
  return settleVoucherUsage(tx, { invoiceId }, 'released', now);
}
