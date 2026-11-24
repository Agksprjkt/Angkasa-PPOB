import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { webhookEvents } from '@/lib/server/db/schema';

// Records a provider event id exactly once. Returns false when the event was
// already stored, which lets the caller treat the delivery as a replay.
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
  return inserted ? { id: inserted.id, replayed: false as const } : { replayed: true as const };
}

export async function markWebhookEventProcessed(provider: string, id: string) {
  await getDatabase()
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(and(eq(webhookEvents.id, id), eq(webhookEvents.provider, provider)));
}
