import { useTranslation } from 'react-i18next';
import type { NetFigureLabels } from '../figures';
import { useStoryCast } from '../figures/useStoryCast';

/** NetFigure texts from the `intro.figure` locale section. */
export function useNetLabels(): Partial<NetFigureLabels> {
  const { t, i18n } = useTranslation();
  const { names, asker, chatMembers } = useStoryCast();
  return {
    names,
    you: t('intro.figure.you'),
    asker,
    amount: t('intro.figure.amount'),
    chatTitle: t('intro.figure.chatTitle'),
    chatMembers,
    rtl: i18n.dir() === 'rtl',
    aria: t('intro.figure.aria'),
  };
}
