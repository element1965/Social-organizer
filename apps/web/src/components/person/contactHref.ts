import { buildContactUrl, isSafeContactUrl } from '@so/shared';

/** A safe link for a contact, or an empty string when the value must not become a link. */
export function contactHref(type: string, value: string): string {
  const url = type === 'phone' ? `tel:${value.trim()}` : buildContactUrl(type, value);
  return isSafeContactUrl(url) ? url : '';
}
