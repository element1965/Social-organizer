import en from '../locales/en.json' with { type: 'json' };
import ru from '../locales/ru.json' with { type: 'json' };
import es from '../locales/es.json' with { type: 'json' };
import fr from '../locales/fr.json' with { type: 'json' };
import de from '../locales/de.json' with { type: 'json' };
import pt from '../locales/pt.json' with { type: 'json' };
import it from '../locales/it.json' with { type: 'json' };
import zh from '../locales/zh.json' with { type: 'json' };
import ja from '../locales/ja.json' with { type: 'json' };
import ko from '../locales/ko.json' with { type: 'json' };
import ar from '../locales/ar.json' with { type: 'json' };
import hi from '../locales/hi.json' with { type: 'json' };
import tr from '../locales/tr.json' with { type: 'json' };
import pl from '../locales/pl.json' with { type: 'json' };
import uk from '../locales/uk.json' with { type: 'json' };
import nl from '../locales/nl.json' with { type: 'json' };
import sv from '../locales/sv.json' with { type: 'json' };
import da from '../locales/da.json' with { type: 'json' };
import fi from '../locales/fi.json' with { type: 'json' };
import no from '../locales/no.json' with { type: 'json' };
import cs from '../locales/cs.json' with { type: 'json' };
import ro from '../locales/ro.json' with { type: 'json' };
import th from '../locales/th.json' with { type: 'json' };
import vi from '../locales/vi.json' with { type: 'json' };
import id from '../locales/id.json' with { type: 'json' };
import sr from '../locales/sr.json' with { type: 'json' };
import he from '../locales/he.json' with { type: 'json' };
import be from '../locales/be.json' with { type: 'json' };

export const resources = {
  en, ru, es, fr, de, pt, it, zh, ja, ko,
  ar, hi, tr, pl, uk, nl, sv, da, fi, no,
  cs, ro, th, vi, id, sr, he, be,
} as const;

export type SupportedLanguage = keyof typeof resources;

export const languageNames: Record<SupportedLanguage, string> = {
  en: 'English',
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
  be: 'Беларуская',
  ru: 'Русский',
};

export {
  en, ru, es, fr, de, pt, it, zh, ja, ko,
  ar, hi, tr, pl, uk, nl, sv, da, fi, no,
  cs, ro, th, vi, id, sr, he, be,
};
