import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, type SupportedLanguage } from '@so/i18n';

const supportedLanguages = Object.keys(resources) as SupportedLanguage[];

function detectLanguage(): string {
  const stored = localStorage.getItem('language');
  if (stored && supportedLanguages.includes(stored as SupportedLanguage)) return stored;
  const nav = navigator.language?.slice(0, 2);
  if (nav && supportedLanguages.includes(nav as SupportedLanguage)) return nav;
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
