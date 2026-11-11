/**
 * Escapes text put into a Telegram message sent with parse_mode HTML. Names come from people and from
 * Telegram profiles: an unescaped "<3 Anna" or "Tom & Jerry" makes Telegram refuse the whole message.
 */
export function tgEscape(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
