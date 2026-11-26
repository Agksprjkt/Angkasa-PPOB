// Pure helpers for the dashboard "generate secret" action, kept import-free so
// the API route and the tests share one definition.
export const generatedSecretBytes = 32;

export const secretTargets = [
  'digiflazzWebhookSecret',
  'tokovoucherWebhookSecret',
  'betterAuthSecret',
] as const;

export type SecretTarget = (typeof secretTargets)[number];

// Targets stored in the settings table: generating them takes effect at once.
// The auth secret lives in the environment, so it is never stored here.
export const storedSecretTargets: readonly SecretTarget[] = [
  'digiflazzWebhookSecret',
  'tokovoucherWebhookSecret',
];

export function isSecretTarget(value: unknown): value is SecretTarget {
  return typeof value === 'string' && (secretTargets as readonly string[]).includes(value);
}

// Only the auth secret is read from the environment, so it can be shown for the
// admin to paste into .env but never written by the dashboard.
export function isStoredSecretTarget(target: SecretTarget) {
  return storedSecretTargets.includes(target);
}

export function generateSecret(random: (size: number) => Uint8Array): string {
  return Buffer.from(random(generatedSecretBytes)).toString('base64url');
}

export function isStrongSecret(value: string) {
  return value.length >= 32;
}
