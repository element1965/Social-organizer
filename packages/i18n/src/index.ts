import en from '../locales/en.json';
import ru from '../locales/ru.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import de from '../locales/de.json';
import pt from '../locales/pt.json';
import it from '../locales/it.json';
import zh from '../locales/zh.json';
import ja from '../locales/ja.json';
import ko from '../locales/ko.json';
import ar from '../locales/ar.json';
import hi from '../locales/hi.json';
import tr from '../locales/tr.json';
import pl from '../locales/pl.json';
import uk from '../locales/uk.json';
import nl from '../locales/nl.json';
import sv from '../locales/sv.json';
import da from '../locales/da.json';
import fi from '../locales/fi.json';
import no from '../locales/no.json';
import cs from '../locales/cs.json';
import ro from '../locales/ro.json';
import th from '../locales/th.json';
import vi from '../locales/vi.json';
import id from '../locales/id.json';
import sr from '../locales/sr.json';
import he from '../locales/he.json';

export const resources = {
  en, ru, es, fr, de, pt, it, zh, ja, ko,
  ar, hi, tr, pl, uk, nl, sv, da, fi, no,
  cs, ro, th, vi, id, sr, he,
} as const;

export type SupportedLanguage = keyof typeof resources;

export const languageNames: Record<SupportedLanguage, string> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  it: 'Italiano',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
  hi: 'हिन्दी',
  tr: 'Türkçe',
  pl: 'Polski',
  uk: 'Українська',
  nl: 'Nederlands',
  sv: 'Svenska',
  da: 'Dansk',
  fi: 'Suomi',
  no: 'Norsk',
  cs: 'Čeština',
  ro: 'Română',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  sr: 'Српски',
  he: 'עברית',
};

export {
  en, ru, es, fr, de, pt, it, zh, ja, ko,
  ar, hi, tr, pl, uk, nl, sv, da, fi, no,
  cs, ro, th, vi, id, sr, he,
};
