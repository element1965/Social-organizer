import { useTranslation } from 'react-i18next';
import { useCachedNetworkStats } from '../../hooks/useCachedNetworkStats';

/** A rounded count from the server: under 5 people it is only "a few". */
export type FarCount = { count: number; approx: boolean; few: boolean };

type Far = Record<'4' | '5' | 'beyond', FarCount>;

/**
 * The 4th and 5th rings and beyond. Only rounded counts reach the app: names, links and even exact
 * numbers stay on the server, so the far part of the network shows how many, never who.
 * `dots` feeds the graph's anonymous dust; `label` is the line next to the ring chips.
 */
export function useFarRings(): { dots: number[] | undefined; label: string | undefined } {
  const { t, i18n } = useTranslation();
  const stats = useCachedNetworkStats();
  // Older cached stats (before this field existed) have no `far`
  const far = (stats.data as { far?: Far } | undefined)?.far;
  if (!far) return { dots: undefined, label: undefined };

  const dotsOf = (key: '4' | '5') => (far[key].few ? 3 : far[key].count);
  // The label speaks of the 4th and 5th rings only; people further out are not counted in it
  const sum = far['4'].count + far['5'].count;
  const few = sum === 0 && (far['4'].few || far['5'].few);
  const label =
    sum > 0
      ? t('circle.rings.farther', { value: new Intl.NumberFormat(i18n.language).format(sum) })
      : few
        ? t('circle.rings.fartherFew')
        : undefined;
  return { dots: [dotsOf('4'), dotsOf('5')], label };
}
