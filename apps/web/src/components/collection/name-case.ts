import { firstName } from './text';

/**
 * Rough Russian inflection for a given name, used on the public collection page.
 * Non-Cyrillic names stay as written. Unusual names fall back to the nominative.
 */
export function inflectName(fullName: string, form: 'dative' | 'genitive'): string {
  const name = firstName(fullName);
  if (!/^[\u0400-\u04FF-]+$/.test(name)) return name;
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
