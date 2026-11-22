/** Convert the digits and punctuation provided by Arabic and Persian numeric keyboards. */
export function normalizeMoneyInput(raw: string): string {
  const digits = raw.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (char) => {
    const zero = char >= '\u06f0' ? '\u06f0' : '\u0660';
    return String(char.charCodeAt(0) - zero.charCodeAt(0));
  });
  if (/^\s*\d{1,3}(?:\u066c\d{3})+\s*$/.test(digits)) return digits.replaceAll('\u066c', '');
  return digits.replaceAll('\u066b', '.').replaceAll('\u066c', ',');
}

/** Whole dollars only. Empty and partial input is not a number. */
export function parseWhole(raw: string): number | null {
  const cleaned = normalizeMoneyInput(raw).replace(/\s/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}
