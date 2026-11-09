/**
 * Language list without the translations. Import from `@so/i18n/languages` in the web app so the bundle does not
 * pull every locale file; the server keeps using the root entry with all `resources`.
 */
export const languageNames = {
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
} as const;

export type SupportedLanguage = keyof typeof languageNames;

export const SUPPORTED_LANGUAGES = Object.keys(languageNames) as SupportedLanguage[];

/** Right-to-left languages, for `dir` on <html>. */
export const RTL_LANGUAGES: readonly string[] = ['ar', 'he', 'fa', 'ur'];
