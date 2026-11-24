import 'server-only';

import { lt, sql } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { orderLookupRateLimits } from '@/lib/server/db/schema';
import { consumeRedisRateLimit } from '@/lib/server/redis';

// Redis is optional; without it the DB table keeps the limit enforced instead of
// silently allowing every request.
export async function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const redisResult = await consumeRedisRateLimit(key, limit, windowMs);
  if (redisResult !== null) return redisResult;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);
  try {
    const [entry] = await getDatabase()
      .insert(orderLookupRateLimits)
      .values({ key, attempts: 1, windowStartedAt: now, expiresAt, updatedAt: now })
      .onConflictDoUpdate({
        target: orderLookupRateLimits.key,
        set: {
          attempts: sql`CASE WHEN ${orderLookupRateLimits.expiresAt} <= ${now} THEN 1 ELSE ${orderLookupRateLimits.attempts} + 1 END`,
          windowStartedAt: sql`CASE WHEN ${orderLookupRateLimits.expiresAt} <= ${now} THEN ${now} ELSE ${orderLookupRateLimits.windowStartedAt} END`,
          expiresAt: sql`CASE WHEN ${orderLookupRateLimits.expiresAt} <= ${now} THEN ${expiresAt} ELSE ${orderLookupRateLimits.expiresAt} END`,
          updatedAt: now,
        },
      })
      .returning({ attempts: orderLookupRateLimits.attempts });
    if (!entry) return false;
    if (entry.attempts === 1) {
      // Cheap opportunistic cleanup; the window is long enough that this is rare.
      void getDatabase()
        .delete(orderLookupRateLimits)
        .where(lt(orderLookupRateLimits.expiresAt, now))
        .catch(() => undefined);
    }
    return entry.attempts <= limit;
  } catch (error) {
    console.error(
      '[RATE_LIMIT_FALLBACK_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return false;
  }
}

export function clientAddress(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const real = request.headers.get('x-real-ip')?.trim();
  return (forwarded || real || 'unknown').slice(0, 128);
}
