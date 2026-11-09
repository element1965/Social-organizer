import { useTranslation } from 'react-i18next';
import type { NetFigureLabels } from '../figures';

/** NetFigure texts from the `intro.figure` locale section. */
export function useNetLabels(): Partial<NetFigureLabels> {
  const { t } = useTranslation();
  const names = t('intro.figure.names', { returnObjects: true });
  return {
    // An undefined key would override the defaults when spread, so leave it out instead
    ...(Array.isArray(names) && names.length >= 6 ? { names: names as string[] } : {}),
    you: t('intro.figure.you'),
    asker: t('intro.figure.asker'),
    amount: t('intro.figure.amount'),
    chatTitle: t('intro.figure.chatTitle'),
    chatMembers: t('intro.figure.chatMembers'),
    aria: t('intro.figure.aria'),
  };
}
