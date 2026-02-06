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
export const MAX_BFS_DEPTH = 6;
export const MAX_BFS_RECIPIENTS = 10_000;
export const NOTIFICATION_RATIO = 1; // сумма = количество уведомлений (1:1)
export const FB_BUNDLE_SIZE_LIMIT_MB = 5;
export const GRAPH_SLICE_DEPTH = 3;

export const CONTACT_TYPES = [
  { type: 'telegram', label: 'Telegram', icon: 'telegram', placeholder: '@username или t.me/...' },
  { type: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', placeholder: '+380...' },
  { type: 'facebook', label: 'Facebook', icon: 'facebook', placeholder: 'facebook.com/...' },
  { type: 'instagram', label: 'Instagram', icon: 'instagram', placeholder: '@username' },
  { type: 'twitter', label: 'X (Twitter)', icon: 'twitter', placeholder: '@username' },
  { type: 'linkedin', label: 'LinkedIn', icon: 'linkedin', placeholder: 'linkedin.com/in/...' },
  { type: 'vk', label: 'VKontakte', icon: 'vk', placeholder: 'vk.com/...' },
  { type: 'email', label: 'Email', icon: 'mail', placeholder: 'email@example.com' },
  { type: 'website', label: 'Website', icon: 'globe', placeholder: 'https://...' },
] as const;

export type ContactType = typeof CONTACT_TYPES[number]['type'];
