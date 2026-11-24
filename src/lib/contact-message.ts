// Pure helper so the contact page and its test share one implementation.
export const maxContactMessageLength = 800;

export function buildWhatsAppMessageUrl(number: string, message: string) {
  const digits = number.replace(/\D/g, '');
  if (!digits) return null;
  // wa.me rejects very long URLs; the composed text is capped well below that.
  return `https://wa.me/${digits}?text=${encodeURIComponent(message.slice(0, 1200))}`;
}

export function buildContactMessage(input: {
  storeName: string;
  name: string;
  phone?: string;
  topic: string;
  message: string;
}) {
  const lines = [
    `Halo ${input.storeName}, saya ${input.name.trim()}.`,
    input.phone?.trim() ? `Nomor saya: ${input.phone.trim()}` : null,
    `Topik: ${input.topic}`,
    '',
    input.message.trim(),
  ];
  return lines.filter((line) => line !== null).join('\n');
}
