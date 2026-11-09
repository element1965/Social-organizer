export const MAX_CONNECTIONS = 150;
export const MIN_OBLIGATION_AMOUNT = 1;
export const MIN_COLLECTION_AMOUNT = 10;
export const NOTIFICATION_TTL_HOURS = 24;
export const RE_NOTIFY_INTERVAL_HOURS = 12;
export const REGULAR_CYCLE_DAYS = 28;
export const LINKING_CODE_TTL_MINUTES = 5;
export const LINKING_CODE_LENGTH = 6;
export const JWT_ACCESS_TTL_MINUTES = 30;
export const JWT_REFRESH_TTL_DAYS = 30;
export const LARGE_AMOUNT_WARNING = 10_000;
export const POLLING_INTERVAL_MS = 30_000;
export const MAX_BFS_DEPTH = 99;
export const MAX_BFS_RECIPIENTS = 10_000;
export const NOTIFICATION_RATIO = 1; // сумма = количество уведомлений (1:1)
export const FB_BUNDLE_SIZE_LIMIT_MB = 5;
export const GRAPH_SLICE_DEPTH = 3;
export const MIN_CONNECTIONS_TO_CREATE = 10;

export const CONTACT_TYPES = [
  { type: 'telegram', label: 'Telegram', icon: 'telegram', placeholder: '@username или t.me/...' },
  { type: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', placeholder: '+380...' },
  { type: 'facebook', label: 'Facebook', icon: 'facebook', placeholder: 'facebook.com/...' },
  { type: 'instagram', label: 'Instagram', icon: 'instagram', placeholder: '@username' },
  { type: 'twitter', label: 'X (Twitter)', icon: 'twitter', placeholder: '@username' },
  { type: 'tiktok', label: 'TikTok', icon: 'tiktok', placeholder: '@username' },
  { type: 'linkedin', label: 'LinkedIn', icon: 'linkedin', placeholder: 'linkedin.com/in/...' },
  { type: 'vk', label: 'VKontakte', icon: 'vk', placeholder: 'vk.com/...' },
  { type: 'email', label: 'Email', icon: 'mail', placeholder: 'email@example.com' },
  { type: 'website', label: 'Website', icon: 'globe', placeholder: 'https://...' },
] as const;

export type ContactType = typeof CONTACT_TYPES[number]['type'];

export const CONTACT_TYPE_IDS = CONTACT_TYPES.map((c) => c.type) as unknown as [ContactType, ...ContactType[]];
export const MAX_CONTACT_VALUE_LENGTH = 300;

/** Only these schemes may ever be rendered as a contact link or passed to openLink. */
export function isSafeContactUrl(url: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(url);
}

/** A value that looks like "scheme:..." but is not http(s) (e.g. javascript:, data:). */
export function hasForeignScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value);
}

/** Returns '' for unknown types and for anything that is not a safe http/https/mailto URL. */
export function buildContactUrl(type: string, value: string): string {
  const url = buildContactUrlUnchecked(type, value);
  return isSafeContactUrl(url) ? url : '';
}

function buildContactUrlUnchecked(type: string, value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  const clean = value.replace(/^@/, '');
  switch (type) {
    case 'telegram': return `https://t.me/${clean}`;
    case 'instagram': return `https://instagram.com/${clean}`;
    case 'twitter': return `https://x.com/${clean}`;
    case 'facebook': return `https://facebook.com/${clean}`;
    case 'linkedin': return `https://linkedin.com/in/${clean}`;
    case 'vk': return `https://vk.com/${clean}`;
    case 'email': return `mailto:${value}`;
    case 'tiktok': return `https://tiktok.com/@${clean}`;
    case 'whatsapp': return `https://wa.me/${value.replace(/\D/g, '')}`;
    case 'website': return `https://${value}`;
    default: return '';
  }
}
