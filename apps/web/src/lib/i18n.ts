import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, type SupportedLanguage } from '@so/i18n';

const supportedLanguages = Object.keys(resources) as SupportedLanguage[];

function detectLanguage(): string {
  // 1. Explicit user choice persisted in localStorage
  const stored = localStorage.getItem('language');
  if (stored && supportedLanguages.includes(stored as SupportedLanguage)) return stored;

  // 2. Walk through all browser-preferred languages (navigator.languages)
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of candidates) {
    if (!tag) continue;
    // Try exact 2-letter code first (e.g. "uk", "he")
    const short = tag.slice(0, 2).toLowerCase();
    if (supportedLanguages.includes(short as SupportedLanguage)) return short;
  }

  // 3. Fallback
  return 'en';
}

const i18nResources: Record<string, { translation: Record<string, unknown> }> = {};
for (const [lang, translations] of Object.entries(resources)) {
  i18nResources[lang] = { translation: translations as Record<string, unknown> };
}

i18n.use(initReactI18next).init({
  resources: i18nResources,
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
