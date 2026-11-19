/**
 * The sums of the landing story, in dollars as the app counts them. The heroine has lost her job and is short of
 * the rent (part of it, not the whole rent). That gap is very different money from India to Norway, so the
 * shortfall follows the price level of the reader's country (the region of the
 * browser language; without one, the page language), in whole hundreds so "up to N people" reads the same in
 * every grammar. A Need reaches up to one person per dollar, so the reach is the same number. The smallest share
 * stays $1 and yours $5.
 */
export interface StoryMoney {
  shortfall: number;
  min: number;
  mine: number;
}

/** Dollars short of a month's rent, by price level. */
const TIERS: [number, string[]][] = [
  [600, ['CH', 'NO', 'IS', 'DK', 'LU', 'LI', 'MC']],
  [500, ['US', 'CA', 'GB', 'IE', 'DE', 'AT', 'NL', 'BE', 'FR', 'FI', 'SE', 'AU', 'NZ', 'IL', 'SG', 'HK', 'AE', 'QA', 'KW', 'BH']],
  [400, ['IT', 'ES', 'PT', 'JP', 'KR', 'TW', 'SA', 'OM', 'GR', 'CY', 'MT', 'SI', 'EE']],
  [300, ['CZ', 'SK', 'PL', 'HU', 'LT', 'LV', 'HR', 'RO', 'BG', 'RU', 'KZ', 'CN', 'MY', 'TR', 'MX', 'BR', 'AR', 'CL', 'UY', 'CR', 'PA', 'ZA', 'ME']],
  [200, ['UA', 'BY', 'MD', 'RS', 'BA', 'MK', 'AL', 'GE', 'AM', 'AZ', 'UZ', 'KG', 'TH', 'ID', 'PH', 'VN', 'CO', 'PE', 'EC', 'BO', 'PY', 'DO', 'GT', 'EG', 'MA', 'TN', 'DZ', 'JO', 'LB', 'IQ', 'IR', 'MN']],
  [100, ['IN', 'PK', 'BD', 'NP', 'LK', 'MM', 'KH', 'LA', 'KE', 'NG', 'GH', 'ET', 'UG', 'TZ', 'RW', 'TJ']],
];
const BY_REGION = new Map(TIERS.flatMap(([usd, regions]) => regions.map((r) => [r, usd] as const)));

/** The price level of a page language's main country, when the browser names no region. */
const BY_LANGUAGE: Record<string, number> = {
  en: 500, ru: 300, uk: 200, be: 200, de: 500, fr: 500, es: 300, it: 400, pt: 300, nl: 500, fi: 500, pl: 300,
  cs: 300, ro: 300, sr: 200, tr: 300, he: 500, ar: 300, hi: 100, id: 200, vi: 200, th: 200, ja: 400, ko: 400,
  zh: 300, sv: 500, no: 600, da: 600,
};

/** The region of the browser language: one of the page language first, then any. */
function browserRegion(lang: string): string | null {
  if (typeof navigator === 'undefined') return null;
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  const own = list.filter((tag) => tag.toLowerCase().split('-')[0] === lang);
  for (const tag of [...own, ...list]) {
    try {
      const region = new Intl.Locale(tag).region?.toUpperCase();
      // a country (a region like 419, Latin America, says nothing about prices)
      if (region && /^[A-Z]{2}$/.test(region)) return region;
    } catch {
      /* not a language tag */
    }
  }
  return null;
}

export function storyMoney(lang: string): StoryMoney {
  const region = browserRegion(lang);
  const shortfall = (region ? BY_REGION.get(region) : undefined) ?? BY_LANGUAGE[lang] ?? 300;
  return { shortfall, min: 1, mine: 5 };
}

/** "$500", "500 $": dollars the way the locale writes them, no cents. */
export function dollarFormat(lang: string): Intl.NumberFormat {
  const base = { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 } as const;
  try {
    return new Intl.NumberFormat(lang, { ...base, currencyDisplay: 'narrowSymbol' });
  } catch {
    return new Intl.NumberFormat(lang, base);
  }
}
