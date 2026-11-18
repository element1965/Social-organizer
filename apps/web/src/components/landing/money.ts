import { COUNTRY_TO_CURRENCY } from '@so/shared';

/**
 * The sums of the landing story in the reader's currency: a car repair worth about $300 (so Maria's Need still
 * reaches about 300 people, one per dollar), the smallest share (about $1) and yours (about $5). The rates are
 * rough on purpose and rounded to sums people say aloud. The region of the browser language picks the currency;
 * without one, the page language does; anything else is told in dollars.
 */
export interface StoryMoney {
  currency: string;
  repair: number;
  min: number;
  mine: number;
}

/** Repair, smallest share, your share. `repair` is a whole multiple of `mine / 5` (the scene counts in those steps). */
const SUMS: Record<string, [number, number, number]> = {
  USD: [300, 1, 5],
  EUR: [250, 1, 5],
  GBP: [220, 1, 5],
  CHF: [250, 1, 5],
  CAD: [400, 1, 5],
  AUD: [450, 2, 10],
  NZD: [500, 2, 10],
  RUB: [25000, 100, 500],
  UAH: [12000, 50, 200],
  BYN: [1000, 3, 20],
  KZT: [150000, 500, 2500],
  PLN: [1100, 5, 20],
  CZK: [6000, 20, 100],
  RON: [1300, 5, 20],
  RSD: [30000, 100, 500],
  TRY: [13000, 50, 200],
  ILS: [1000, 5, 20],
  SEK: [3000, 10, 50],
  NOK: [3000, 10, 50],
  DKK: [2000, 5, 40],
  JPY: [45000, 100, 1000],
  KRW: [400000, 1000, 5000],
  CNY: [2000, 10, 50],
  INR: [25000, 100, 500],
  IDR: [5000000, 20000, 100000],
  VND: [7500000, 20000, 100000],
  THB: [10000, 30, 200],
  BRL: [1600, 5, 25],
  MXN: [5500, 20, 100],
  SAR: [1100, 5, 20],
  AED: [1100, 5, 20],
  EGP: [15000, 50, 250],
};

/** The currency of a page language when the browser names no region. */
const BY_LANGUAGE: Record<string, string> = {
  en: 'USD', ru: 'RUB', uk: 'UAH', be: 'BYN', de: 'EUR', fr: 'EUR', es: 'EUR', it: 'EUR', pt: 'BRL', nl: 'EUR',
  fi: 'EUR', pl: 'PLN', cs: 'CZK', ro: 'RON', sr: 'RSD', tr: 'TRY', he: 'ILS', ar: 'USD', hi: 'INR', id: 'IDR',
  vi: 'VND', th: 'THB', ja: 'JPY', ko: 'KRW', zh: 'CNY', sv: 'SEK', no: 'NOK', da: 'DKK',
};

/** The region of the browser language: one of the page language first, then any. */
function browserRegion(lang: string): string | null {
  if (typeof navigator === 'undefined') return null;
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  const own = list.filter((tag) => tag.toLowerCase().split('-')[0] === lang);
  for (const tag of [...own, ...list]) {
    try {
      const region = new Intl.Locale(tag).region;
      if (region) return region.toUpperCase();
    } catch {
      /* not a language tag */
    }
  }
  return null;
}

export function storyMoney(lang: string): StoryMoney {
  const region = browserRegion(lang);
  const byRegion = region ? COUNTRY_TO_CURRENCY[region] : undefined;
  const currency = byRegion && SUMS[byRegion] ? byRegion : SUMS[BY_LANGUAGE[lang] ?? ''] ? BY_LANGUAGE[lang]! : 'USD';
  const [repair, min, mine] = SUMS[currency]!;
  return { currency, repair, min, mine };
}

/** "$300", "25 000 ₽", "￥45,000": the sign the reader knows, no cents. */
export function moneyFormat(lang: string, currency: string): Intl.NumberFormat {
  const base = { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 } as const;
  try {
    return new Intl.NumberFormat(lang, { ...base, currencyDisplay: 'narrowSymbol' });
  } catch {
    return new Intl.NumberFormat(lang, base);
  }
}
