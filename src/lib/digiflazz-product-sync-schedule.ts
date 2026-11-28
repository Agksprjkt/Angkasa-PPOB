export const digiflazzAutoSyncIntervals = [1, 7, 14, 30] as const;
export type DigiflazzAutoSyncInterval = (typeof digiflazzAutoSyncIntervals)[number];

export function isDigiflazzProductSyncDue(
  enabled: boolean,
  nextRunAt: string | null,
  now: Date,
) {
  if (!enabled) return false;
  if (!nextRunAt) return true;
  const nextRunTime = Date.parse(nextRunAt);
  return !Number.isFinite(nextRunTime) || nextRunTime <= now.getTime();
}

export function getNextDigiflazzProductSyncAt(
  from: Date,
  intervalDays: DigiflazzAutoSyncInterval,
) {
  return new Date(from.getTime() + intervalDays * 24 * 60 * 60 * 1000);
}
