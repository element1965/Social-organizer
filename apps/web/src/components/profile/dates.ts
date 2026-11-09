export function formatLongDate(value: Date | string, lang: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDayMonth(value: Date | string, lang: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(lang, { day: 'numeric', month: 'long' });
}

export function relativeTime(value: Date | string, lang: string): string {
  const date = new Date(value);
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (diffSec < 3600) return rtf.format(-Math.max(1, Math.round(diffSec / 60)), 'minute');
  if (diffSec < 86400) return rtf.format(-Math.round(diffSec / 3600), 'hour');
  return rtf.format(-Math.round(diffSec / 86400), 'day');
}
