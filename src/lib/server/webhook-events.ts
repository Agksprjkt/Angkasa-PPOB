import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { webhookEvents } from '@/lib/server/db/schema';

// An unprocessed event may be retried after a handler failure; only completed
// events are treated as replays.
export async function claimWebhookEvent(
  provider: string,
  eventId: string,
  eventType: string,
) {
  const id = randomUUID();
  const [inserted] = await getDatabase()
    .insert(webhookEvents)
    .values({ id, provider, eventId, eventType })
    .onConflictDoNothing({
      target: [webhookEvents.provider, webhookEvents.eventId],
    })
    .returning({ id: webhookEvents.id });
  if (inserted) return { id: inserted.id, replayed: false as const };

  const existing = await getDatabase()
    .select({
      id: webhookEvents.id,
      processedAt: webhookEvents.processedAt,
    })
    .from(webhookEvents)
    .where(and(
      eq(webhookEvents.provider, provider),
      eq(webhookEvents.eventId, eventId),
    ))
    .limit(1)
    .then((rows) => rows[0]);
  if (!existing) throw new Error('Webhook event was not available after conflict.');

  return {
    id: existing.id,
    replayed: existing.processedAt !== null,
  };
}

export async function markWebhookEventProcessed(provider: string, id: string) {
  await getDatabase()
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(and(eq(webhookEvents.id, id), eq(webhookEvents.provider, provider)));
}
