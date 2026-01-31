export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '\u20ac', decimals: 2 },
];

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

export function getCurrency(code: string): CurrencyInfo | undefined {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code);
}

export function isSupportedCurrency(code: string): boolean {
  return CURRENCY_CODES.includes(code);
}
