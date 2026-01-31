import en from '../locales/en.json';
import ru from '../locales/ru.json';

export const resources = { en, ru } as const;
export type SupportedLanguage = keyof typeof resources;
export { en, ru };
