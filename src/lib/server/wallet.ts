import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { balanceLedger, users } from '@/lib/server/db/schema';

type WalletTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['transaction']>[0]
>[0];

type BalanceDelta = {
  userId: string;
  actorId?: string | null;
  amount: number;
  type: 'credit' | 'debit';
  idempotencyKey: string;
  reference: string;
  note: string;
  updatedAt?: Date;
};

type BalanceDeltaResult =
  | {
      ledger: typeof balanceLedger.$inferSelect;
      balanceBefore: number;
      balanceAfter: number;
    }
  | {
      error: 'USER_NOT_FOUND' | 'INSUFFICIENT_BALANCE' | 'BALANCE_OUT_OF_RANGE';
    };

export async function applyBalanceDelta(
  tx: WalletTransaction,
  input: BalanceDelta,
): Promise<BalanceDeltaResult> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error('Wallet adjustment amount must be a positive safe integer');
  }

  const delta = input.type === 'credit' ? input.amount : -input.amount;
  const updatedAt = input.updatedAt ?? new Date();
  const balanceGuard = input.type === 'credit'
    ? lte(users.balance, Number.MAX_SAFE_INTEGER - input.amount)
    : gte(users.balance, input.amount);
  const [updatedUser] = await tx
    .update(users)
    .set({
      balance: sql`${users.balance} + ${delta}`,
      updatedAt,
    })
    .where(and(eq(users.id, input.userId), balanceGuard))
    .returning({ balance: users.balance });

  if (!updatedUser) {
    const [existingUser] = await tx
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!existingUser) return { error: 'USER_NOT_FOUND' as const };
    if (input.type === 'debit' && existingUser.balance < input.amount) {
      return { error: 'INSUFFICIENT_BALANCE' as const };
    }
    return { error: 'BALANCE_OUT_OF_RANGE' as const };
  }

  const balanceAfter = updatedUser.balance;
  const balanceBefore = balanceAfter - delta;
  if (!Number.isSafeInteger(balanceBefore) || !Number.isSafeInteger(balanceAfter)) {
    throw new Error('Wallet balance exceeded the supported safe integer range');
  }

  const [ledger] = await tx
    .insert(balanceLedger)
    .values({
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      userId: input.userId,
      actorId: input.actorId ?? null,
      type: input.type,
      amount: input.amount,
      balanceBefore,
      balanceAfter,
      reference: input.reference,
      note: input.note,
      createdAt: updatedAt,
    })
    .returning();

  return { ledger, balanceBefore, balanceAfter };
}
