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
/** @deprecated Superseded by ASK_MIN_DIRECT / ASK_MIN_NETWORK; kept because the old UI still reads it. */
export const MIN_CONNECTIONS_TO_CREATE = 10;
/** Request thresholds (server-enforced): confirmed direct connections and people in the whole network. */
export const ASK_MIN_DIRECT = 5;
export const ASK_MIN_NETWORK = 10;

/**
 * Where a connection request (and the connection it becomes) came from. Kept for the admin funnel only:
 * it shows which way of inviting works, never anything about a person to other people.
 * - link: the personal invite link; link_tg / link_wa: the same link shared with `?src=tg` / `?src=wa`
 * - qr: live QR scanned in person; shake: two phones shaken together
 * - need: joined from a public Need page; direct: a request from a person's page
 * - suggest: "You may know each other"; bot: the Telegram bot kept a lost invite
 */
export const CONNECTION_SOURCES = ['link', 'link_tg', 'link_wa', 'qr', 'shake', 'need', 'direct', 'suggest', 'bot'] as const;
export type ConnectionSource = (typeof CONNECTION_SOURCES)[number];

/** Values of `?src=` on a shared invite address. */
export const INVITE_SRC_PARAMS = ['tg', 'wa'] as const;
export type InviteSrcParam = (typeof INVITE_SRC_PARAMS)[number];

export function inviteSrcParam(raw: string | null | undefined): InviteSrcParam | undefined {
  return (INVITE_SRC_PARAMS as readonly string[]).includes(raw ?? '') ? (raw as InviteSrcParam) : undefined;
}

export function linkSource(src: InviteSrcParam | null | undefined): ConnectionSource {
  return src === 'tg' ? 'link_tg' : src === 'wa' ? 'link_wa' : 'link';
}

/** "You may know each other": how many acquaintances two people must share, and how many are offered. */
export const SUGGEST_MIN_MUTUAL = 2;
export const SUGGEST_LIMIT = 8;

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

/** A value that looks like "scheme:..." but is not http(s) (e.g. javascript:, data:). */
export function hasForeignScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value);
}

const SAFE_CONTACT_URL = /^(https?:|mailto:|tel:)/i;
const DANGEROUS_SCHEME = /^(javascript|data|vbscript|file):/i;

/** True when a contact href is safe to render or pass to openLink. */
export function isSafeContactUrl(url: string): boolean {
  return SAFE_CONTACT_URL.test(url.trim());
}

export function buildContactUrl(type: string, value: string): string {
  const raw = value.trim();
  if (!raw || DANGEROUS_SCHEME.test(raw)) return '';
  const known = CONTACT_TYPES.some((item) => item.type === type) || type === 'phone';
  if (!known) return '';
  if (/^https?:/i.test(raw)) return isSafeContactUrl(raw) ? raw : '';

  const clean = raw.replace(/^@/, '');
  let url = '';
  switch (type) {
    case 'telegram': url = `https://t.me/${clean}`; break;
    case 'instagram': url = `https://instagram.com/${clean}`; break;
    case 'twitter': url = `https://x.com/${clean}`; break;
    case 'facebook': url = `https://facebook.com/${clean}`; break;
    case 'linkedin': url = `https://linkedin.com/in/${clean}`; break;
    case 'vk': url = `https://vk.com/${clean}`; break;
    case 'email': url = /^mailto:/i.test(raw) ? raw : `mailto:${raw}`; break;
    case 'tiktok': url = `https://tiktok.com/@${clean}`; break;
    case 'whatsapp': url = `https://wa.me/${raw.replace(/\D/g, '')}`; break;
    case 'website': url = `https://${raw}`; break;
    case 'phone': url = /^tel:/i.test(raw) ? raw : `tel:${raw}`; break;
    default: return '';
  }
  return isSafeContactUrl(url) ? url : '';
}
