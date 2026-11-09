/** Whole dollars only. Empty and partial input is not a number. */
export function parseWhole(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

/** Why a money field cannot be submitted. `whole` is a decimal or other junk; `low` is under the minimum. */
export function amountIssue(raw: string, min: number): 'empty' | 'whole' | 'low' | null {
  const cleaned = raw.trim().replace(/\s/g, '');
  if (!cleaned) return 'empty';
  const value = parseWhole(cleaned);
  if (value == null) return 'whole';
  if (value < min) return 'low';
  return null;
}

export function isHttpsUrl(raw: string): boolean {
  try {
    return new URL(raw.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

export function shortUrl(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || name;
}

export function formatCount(value: number, language: string): string {
  return new Intl.NumberFormat(language).format(value);
}

export function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2 days ago" — the value is already in the past, so the result is negative-relative. */
export function relativePast(date: Date, language: string): string {
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 36) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  return rtf.format(days, 'day');
}

export function formatDay(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' }).format(date);
}
