// Pure social-link model. Kept free of imports so tests and scripts can load it
// directly, and so the admin panel and the storefront share one definition.

export const socialLinkTypes = [
  'whatsapp',
  'instagram',
  'facebook',
  'tiktok',
  'telegram',
  'email',
] as const;

export type SocialLinkType = (typeof socialLinkTypes)[number];

export type SocialLink = {
  type: SocialLinkType;
  label: string;
  value: string;
};

export const socialLinkLabels: Record<SocialLinkType, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  email: 'Email',
};

// Placeholder shown in the admin form so the expected input shape is obvious.
export const socialLinkPlaceholders: Record<SocialLinkType, string> = {
  whatsapp: '081234567890',
  instagram: '@namatoko atau https://instagram.com/namatoko',
  facebook: 'https://facebook.com/namatoko',
  tiktok: 'https://tiktok.com/@namatoko',
  telegram: '@namatoko atau https://t.me/namatoko',
  email: 'halo@toko.com',
};

export function isSocialLinkType(value: string): value is SocialLinkType {
  return (socialLinkTypes as readonly string[]).includes(value);
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const handlePattern = /^@?[A-Za-z0-9._]{1,64}$/;

// Domains accepted per type. A URL is only allowed when it points at the real
// service, so a typo cannot turn the footer into an open redirect.
const allowedHosts: Record<Exclude<SocialLinkType, 'whatsapp' | 'email'>, string[]> = {
  instagram: ['instagram.com', 'www.instagram.com', 'instagr.am'],
  facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'vt.tiktok.com'],
  telegram: ['t.me', 'telegram.me', 'telegram.dog'],
};

function digits(value: string) {
  return value.replace(/\D/g, '');
}

export function normalizeWhatsAppNumber(value: string) {
  const raw = digits(value);
  if (!raw) return '';
  if (raw.startsWith('0')) return `62${raw.slice(1)}`;
  if (raw.startsWith('62')) return raw;
  if (raw.startsWith('8')) return `62${raw}`;
  return raw;
}

function httpUrl(value: string, fallbackHost: string) {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${fallbackHost}/${value.replace(/^\/+/, '')}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export type NormalizedSocialLink = {
  type: SocialLinkType;
  label: string;
  /** Canonical value stored in the database. */
  value: string;
  /** Link used by the storefront. */
  href: string;
  /** Text shown next to the icon. */
  display: string;
};

// Returns null for an invalid entry instead of throwing, so one bad row cannot
// break the whole profile save.
export function normalizeSocialLink(input: SocialLink): NormalizedSocialLink | null {
  const label = input.label.trim().slice(0, 40) || socialLinkLabels[input.type];
  const value = input.value.trim();
  if (!value) return null;

  if (input.type === 'whatsapp') {
    const number = normalizeWhatsAppNumber(value);
    if (number.length < 8 || number.length > 15) return null;
    return {
      type: input.type,
      label,
      value: number,
      href: `https://wa.me/${number}`,
      display: value,
    };
  }

  if (input.type === 'email') {
    if (!emailPattern.test(value) || value.length > 254) return null;
    return {
      type: input.type,
      label,
      value,
      href: `mailto:${value}`,
      display: value,
    };
  }

  // Only a bare handle or a real http(s) URL is accepted. Anything else (for
  // example `javascript:...`) is rejected instead of being prefixed with the
  // service host, which would turn arbitrary text into a "valid" profile URL.
  const looksLikeUrl = /^https?:\/\//i.test(value);
  if (!looksLikeUrl) {
    if (!handlePattern.test(value)) return null;
    const handle = value.replace(/^@/, '');
    const host = allowedHosts[input.type][0];
    const url = new URL(`https://${host}/${handle}`);
    return {
      type: input.type,
      label,
      value: `@${handle}`,
      href: url.toString(),
      display: `@${handle}`,
    };
  }

  const url = httpUrl(value, allowedHosts[input.type][0]);
  if (!url) return null;
  if (!allowedHosts[input.type].includes(url.hostname.toLowerCase())) return null;
  if (url.pathname.replace(/\/+$/, '').length < 2) return null;

  return {
    type: input.type,
    label,
    value: url.toString(),
    href: url.toString(),
    display: value,
  };
}

export function parseSocialLinks(raw: unknown): SocialLink[] {
  if (!Array.isArray(raw)) return [];
  const links: SocialLink[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.type !== 'string' || !isSocialLinkType(record.type)) continue;
    if (typeof record.value !== 'string') continue;
    links.push({
      type: record.type,
      label: typeof record.label === 'string' ? record.label.slice(0, 40) : '',
      value: record.value.slice(0, 300),
    });
  }
  return links;
}

export function normalizeSocialLinks(raw: unknown): NormalizedSocialLink[] {
  return parseSocialLinks(raw)
    .map(normalizeSocialLink)
    .filter((link): link is NormalizedSocialLink => link !== null);
}

// The legacy supportPhone is promoted to a WhatsApp entry so existing stores keep
// a working contact link without retyping it.
export function withSupportPhoneFallback(
  links: NormalizedSocialLink[],
  supportPhone: string,
): NormalizedSocialLink[] {
  if (links.length > 0) return links;
  const number = normalizeWhatsAppNumber(supportPhone);
  if (number.length < 8) return links;
  return [{
    type: 'whatsapp',
    label: socialLinkLabels.whatsapp,
    value: number,
    href: `https://wa.me/${number}`,
    display: supportPhone.trim(),
  }];
}
