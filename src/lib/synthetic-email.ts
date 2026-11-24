export const SYNTHETIC_EMAIL_DOMAIN = 'agks.id';

// Users register with a WhatsApp number only, but better-auth requires a unique
// email. The address is derived from the number in canonical 62 form so a local
// "08…" and an E.164 "+628…" resolve to the same mailbox.
function canonicalDigits(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

export function syntheticEmailForPhone(phoneNumber: string) {
  return `${canonicalDigits(phoneNumber)}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

// Rows created before the domain change still carry the old address, and the
// password-reset flow has to sign in with whatever is actually stored.
export function legacySyntheticEmailForPhone(phoneNumber: string) {
  return `${canonicalDigits(phoneNumber)}@phone.payku.invalid`;
}

export function isSyntheticEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`)
    || normalized.endsWith('@phone.payku.invalid');
}
