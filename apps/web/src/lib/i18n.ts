import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en, ru } from '@so/i18n';

function detectLanguage(): string {
  const stored = localStorage.getItem('language');
  if (stored) return stored;
  const nav = navigator.language?.slice(0, 2);
  if (nav === 'ru') return 'ru';
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
  },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
