export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const normalized = value.trim().startsWith('+')
    ? `+${digits}`
    : digits.startsWith('0')
      ? `+62${digits.slice(1)}`
      : `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}
