import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChainFigureLabels, HuiFigureLabels, JoinFigureLabels, NetFigureLabels, OrbitFigureLabels } from '../figures';

/** Money as the site writes it: "15 $" in Russian, "$15" in English (Intl decides). */
export function useMoney() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const fmt = new Intl.NumberFormat(i18n.language || 'en', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    return (n: number) => fmt.format(n);
  }, [i18n.language]);
}

/** Translated labels for the explainer figures (how.figures in the locales). */
export function useFigureLabels() {
  const { t, i18n } = useTranslation();
  const money = useMoney();
  return useMemo(() => {
    const arr = (key: string) => t(key, { returnObjects: true }) as unknown as string[];
    const net: Partial<NetFigureLabels> = {
      names: arr('how.figures.net.names'),
      you: t('how.figures.net.you'),
      asker: t('how.figures.net.asker'),
      amount: t('how.figures.net.amount'),
      chatTitle: t('how.figures.net.chatTitle'),
      chatMembers: t('how.figures.net.chatMembers'),
      aria: t('how.figures.net.aria'),
    };
    const orbit: Partial<OrbitFigureLabels> = {
      names: arr('how.figures.orbit.names'),
      you: t('how.figures.orbit.you'),
      pills: arr('how.figures.orbit.pills') as [string, string, string],
      aria: t('how.figures.orbit.aria'),
    };
    const chain: Partial<ChainFigureLabels> = {
      asker: t('how.figures.chain.asker'),
      askerSub: t('how.figures.chain.askerSub'),
      mediator: t('how.figures.chain.mediator'),
      mediatorSub: t('how.figures.chain.mediatorSub'),
      you: t('how.figures.chain.you'),
      youSub: t('how.figures.chain.youSub'),
      amount: t('how.figures.chain.amount'),
      aria: t('how.figures.chain.aria'),
    };
    const join: Partial<JoinFigureLabels> = {
      newcomer: t('how.figures.join.newcomer'),
      newcomerSub: arr('how.figures.join.newcomerSub') as [string, string],
      you: t('how.figures.join.you'),
      youSub: arr('how.figures.join.youSub') as [string, string],
      link: arr('how.figures.join.link') as [string, string],
      aria: t('how.figures.join.aria'),
    };
    const hui: Partial<HuiFigureLabels> = {
      names: arr('how.figures.hui.names'),
      months: arr('how.figures.hui.months'),
      each: t('how.figures.hui.each'),
      onTable: t('how.figures.hui.onTable'),
      takes: (name: string) => t('how.figures.hui.takes', { name }),
      money,
      aria: t('how.figures.hui.aria'),
    };
    return { net, orbit, chain, join, hui };
    // i18n.language re-evaluates the labels when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, i18n.language, money]);
}
