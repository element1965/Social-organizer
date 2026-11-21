import { useTranslation } from 'react-i18next';
import { formatIsolatedMoney } from '../ui2/format';
import type { ChainFigureLabels, HuiFigureLabels, JoinFigureLabels, NetFigureLabels, OrbitFigureLabels } from '../figures';
import { useStoryCast } from '../figures/useStoryCast';

/** Translated labels for the explainer figures (how.figures in the locales). */
export function useFigureLabels() {
  const { t, i18n } = useTranslation();
  const { names, asker, mediator, newcomer, chatMembers } = useStoryCast();
  const arr = (key: string) => t(key, { returnObjects: true }) as unknown as string[];
  const amount = formatIsolatedMoney(300);
  const net: Partial<NetFigureLabels> = {
    names,
    you: t('how.figures.net.you'),
    asker,
    amount,
    chatTitle: t('how.figures.net.chatTitle'),
    chatMembers,
    rtl: i18n.dir() === 'rtl',
    aria: t('how.figures.net.aria'),
  };
  const orbit: Partial<OrbitFigureLabels> = {
    names,
    you: t('how.figures.orbit.you'),
    pills: arr('how.figures.orbit.pills') as [string, string, string],
    aria: t('how.figures.orbit.aria'),
  };
  const chain: Partial<ChainFigureLabels> = {
    asker,
    askerSub: t('how.figures.chain.askerSub', { amount }),
    mediator,
    mediatorSub: t('how.figures.chain.mediatorSub'),
    you: t('how.figures.chain.you'),
    youSub: t('how.figures.chain.youSub'),
    amount,
    aria: t('how.figures.chain.aria'),
  };
  const join: Partial<JoinFigureLabels> = {
    newcomer,
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
    money: formatIsolatedMoney,
    aria: t('how.figures.hui.aria'),
  };
  return { net, orbit, chain, join, hui };
}
