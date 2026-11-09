import i18n, { type BackendModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { RTL_LANGUAGES } from '@so/i18n/languages';

/**
 * Locales are loaded on demand: each `locales/<lang>.json` becomes its own chunk, and the app downloads only the
 * user's language plus English (the fallback). Adding a language = adding one JSON file; nothing else to register.
 */
const loaders = import.meta.glob<{ default: Record<string, unknown> }>('../../../../packages/i18n/locales/*.json');

const localeLoaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {};
for (const [path, load] of Object.entries(loaders)) {
  const code = path.slice(path.lastIndexOf('/') + 1, -'.json'.length);
  localeLoaders[code] = load;
}

/** Languages that have a locale file, in a stable order. */
export const availableLanguages = Object.keys(localeLoaders).sort();

function detectLanguage(): string {
  // 1. Explicit user choice persisted in localStorage
  try {
    const stored = localStorage.getItem('language');
    if (stored && localeLoaders[stored]) return stored;
  } catch {
    // storage unavailable (private mode, blocked site data)
  }

  // 2. Browser-preferred languages, first match by the 2-letter code
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of candidates) {
    if (!tag) continue;
    const short = tag.slice(0, 2).toLowerCase();
    if (localeLoaders[short]) return short;
  }

  // 3. Fallback
  return 'en';
}

const lazyLocales: BackendModule = {
  type: 'backend',
  init: () => {},
  read(language, _namespace, callback) {
    const load = localeLoaders[language];
    if (!load) {
      callback(null, {});
      return;
    }
    load()
      .then((module) => callback(null, module.default))
      .catch((error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null));
  },
};

function applyDirection(language: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.documentElement.dir = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
}

i18n.on('languageChanged', applyDirection);

/** Resolves once the user's language and the English fallback are loaded. Await it before the first render. */
export const i18nReady = i18n
  .use(lazyLocales)
  .use(initReactI18next)
  .init({
    lng: detectLanguage(),
    fallbackLng: 'en',
    supportedLngs: availableLanguages,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    // Screens render after `i18nReady`; a language switch keeps the old texts until the new chunk arrives.
    react: { useSuspense: false },
  })
  .then(() => undefined);

export default i18n;
