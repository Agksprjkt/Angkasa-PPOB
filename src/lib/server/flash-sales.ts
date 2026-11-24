import 'server-only';

import { and, eq, gt, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '@/lib/server/db/client';
import {
  flashSaleOffers,
  flashSaleReservations,
  products,
} from '@/lib/server/db/schema';
import { getAvailableFlashSale } from '@/lib/flash-sale';

type FlashSaleTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['transaction']>[0]
>[0];

type OrderReference =
  | { invoiceId: string; transactionId?: never }
  | { invoiceId?: never; transactionId: string };

export type FlashSaleReservationError =
  | 'FLASH_SALE_UNAVAILABLE'
  | 'FLASH_SALE_PRICE_CHANGED';

export async function reserveFlashSaleCapacity(
  tx: FlashSaleTransaction,
  input: {
    offerId: string;
    productId: string;
    expectedPrice: number;
    now: Date;
    role?: 'user' | 'agent' | 'admin' | 'guest';
  },
): Promise<
  | { salePrice: number; offerId: string }
  | { error: FlashSaleReservationError }
> {
  const row = await tx
    .select({ offer: flashSaleOffers, product: products })
    .from(flashSaleOffers)
    .innerJoin(products, eq(flashSaleOffers.productId, products.id))
    .where(and(
      eq(flashSaleOffers.id, input.offerId),
      eq(flashSaleOffers.productId, input.productId),
    ))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) return { error: 'FLASH_SALE_UNAVAILABLE' };

  const activeOffer = getAvailableFlashSale(row.product, row.offer, input.now, input.role ?? 'user');
  if (!activeOffer) return { error: 'FLASH_SALE_UNAVAILABLE' };
  if (activeOffer.price !== input.expectedPrice) {
    return { error: 'FLASH_SALE_PRICE_CHANGED' };
  }

  const quotaAvailable = or(
    isNull(flashSaleOffers.quotaLimit),
    sql`${flashSaleOffers.quantitySold} + ${flashSaleOffers.quantityReserved} < ${flashSaleOffers.quotaLimit}`,
  );
  const [reserved] = await tx
    .update(flashSaleOffers)
    .set({
      quantityReserved: sql`${flashSaleOffers.quantityReserved} + 1`,
      updatedAt: input.now,
    })
    .where(and(
      eq(flashSaleOffers.id, input.offerId),
      eq(flashSaleOffers.status, 'active'),
      lte(flashSaleOffers.startsAt, input.now),
      gt(flashSaleOffers.endsAt, input.now),
      quotaAvailable,
    ))
    .returning({ id: flashSaleOffers.id });

  return reserved
    ? { offerId: reserved.id, salePrice: activeOffer.price }
    : { error: 'FLASH_SALE_UNAVAILABLE' };
}

export async function releaseFlashSaleCapacity(
  tx: FlashSaleTransaction,
  offerId: string,
  now: Date,
) {
  const [updated] = await tx
    .update(flashSaleOffers)
    .set({
      quantityReserved: sql`${flashSaleOffers.quantityReserved} - 1`,
      updatedAt: now,
    })
    .where(and(
      eq(flashSaleOffers.id, offerId),
      gte(flashSaleOffers.quantityReserved, 1),
    ))
    .returning({ id: flashSaleOffers.id });
  if (!updated) throw new Error('FLASH_SALE_RESERVATION_COUNTER_INVALID');
}

export async function createFlashSaleReservation(
  tx: FlashSaleTransaction,
  offerId: string,
  reference: OrderReference,
  expiresAt: Date | null,
  now: Date,
) {
  await tx.insert(flashSaleReservations).values({
    id: randomUUID(),
    offerId,
    invoiceId: reference.invoiceId ?? null,
    transactionId: reference.transactionId ?? null,
    status: 'reserved',
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
}

export async function settleFlashSaleReservation(
  tx: FlashSaleTransaction,
  reference: OrderReference,
  outcome: 'consumed' | 'released',
  now: Date,
) {
  const match = reference.invoiceId
    ? eq(flashSaleReservations.invoiceId, reference.invoiceId)
    : reference.transactionId
      ? eq(flashSaleReservations.transactionId, reference.transactionId)
      : null;
  if (!match) throw new Error('FLASH_SALE_RESERVATION_REFERENCE_REQUIRED');
  const [reservation] = await tx
    .update(flashSaleReservations)
    .set({ status: outcome, updatedAt: now })
    .where(and(match, eq(flashSaleReservations.status, 'reserved')))
    .returning({ offerId: flashSaleReservations.offerId });
  if (!reservation) return false;

  const [offer] = await tx
    .update(flashSaleOffers)
    .set({
      quantityReserved: sql`${flashSaleOffers.quantityReserved} - 1`,
      ...(outcome === 'consumed'
        ? { quantitySold: sql`${flashSaleOffers.quantitySold} + 1` }
        : {}),
      updatedAt: now,
    })
    .where(and(
      eq(flashSaleOffers.id, reservation.offerId),
      gte(flashSaleOffers.quantityReserved, 1),
    ))
    .returning({ id: flashSaleOffers.id });
  if (!offer) throw new Error('FLASH_SALE_RESERVATION_COUNTER_INVALID');
  return true;
}

export async function expireFlashSaleReservationForInvoice(
  tx: FlashSaleTransaction,
  invoiceId: string,
  now: Date,
) {
  return settleFlashSaleReservation(tx, { invoiceId }, 'released', now);
}

export async function settleFlashSaleForTransaction(
  tx: FlashSaleTransaction,
  transactionId: string,
  outcome: 'consumed' | 'released',
  now: Date,
) {
  return settleFlashSaleReservation(tx, { transactionId }, outcome, now);
}
