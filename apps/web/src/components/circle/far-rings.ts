import { useTranslation } from 'react-i18next';

/** A rounded count from the server: under 5 people it is only "a few". */
export type FarCount = { count: number; approx: boolean; few: boolean };

/**
 * The 4th to 6th rings as one chip and one dust shell. Only one rounded count reaches the app: names, links
 * and even exact numbers stay on the server, so the far part of the network shows how many, never who.
 * The header's people count is 1st + 2nd + 3rd + this count ("a few" adds nothing there).
 * `dots` feeds the graph's anonymous dust; `label` is the line next to the ring chips.
 */
export function useFarRings(far: FarCount | null | undefined): { dots: number[] | undefined; label: string | undefined } {
  const { t, i18n } = useTranslation();
  if (!far) return { dots: undefined, label: undefined };
  const label =
    far.count > 0
      ? t('circle.rings.farther', { value: new Intl.NumberFormat(i18n.language).format(far.count) })
      : far.few
        ? t('circle.rings.fartherFew')
        : undefined;
  return { dots: [far.few ? 3 : far.count], label };
}
