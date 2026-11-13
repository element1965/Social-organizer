/** The first word of a full name ("Anna Petrova" → "Anna"). */
export function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || name;
}

/**
 * Rough Russian inflection for a given name, used where a sentence needs the dative or genitive
 * ("Анне нужно содействие", "круг Анны"): the public Need page and its link preview.
 * Non-Cyrillic names stay as written. Unusual names fall back to the nominative.
 */
export function inflectName(fullName: string, form: 'dative' | 'genitive'): string {
  const name = firstName(fullName);
  if (!/^[Ѐ-ӿ-]+$/.test(name)) return name;
  const lower = name.toLocaleLowerCase('ru');
  if (lower.endsWith('ия')) return swap(name, 2, 'ии');
  if (lower.endsWith('ья')) return swap(name, 2, form === 'dative' ? 'ье' : 'ьи');
  if (lower.endsWith('а')) return swap(name, 1, form === 'dative' ? 'е' : 'ы');
  if (lower.endsWith('я')) return swap(name, 1, form === 'dative' ? 'е' : 'и');
  if (lower.endsWith('й') || lower.endsWith('ь')) return swap(name, 1, form === 'dative' ? 'ю' : 'я');
  return name + (form === 'dative' ? 'у' : 'а');
}

function swap(name: string, drop: number, ending: string): string {
  return name.slice(0, name.length - drop) + ending;
}

/**
 * The invited person's name in a shared invite address (`?to=Vanya`), for "Vanya, Anna invites you…".
 * It lives only in the address the inviter shared: never stored, never shown to anyone else.
 * Letters, spaces, "-", "'" and ".", up to 40 characters; anything else is dropped.
 */
export function safeAddressee(raw: string | null | undefined): string | null {
  const v = (raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!v || v.length > 40 || !/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(v)) return null;
  return v;
}
