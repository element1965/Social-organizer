export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '\u20ac', decimals: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '\u00a3', decimals: 2 },
  { code: 'RUB', name: 'Russian Ruble', symbol: '\u20bd', decimals: 2 },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '\u20b4', decimals: 2 },
  { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '\u20b8', decimals: 2 },
  { code: 'TRY', name: 'Turkish Lira', symbol: '\u20ba', decimals: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '\u20b9', decimals: 2 },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimals: 2 },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '\u20aa', decimals: 2 },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'z\u0142', decimals: 2 },
  { code: 'GEL', name: 'Georgian Lari', symbol: '\u20be', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', decimals: 2 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '\u00a5', decimals: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '\u00a5', decimals: 0 },
  { code: 'KRW', name: 'South Korean Won', symbol: '\u20a9', decimals: 0 },
  { code: 'THB', name: 'Thai Baht', symbol: '\u0e3f', decimals: 2 },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '\u20ab', decimals: 0 },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimals: 0 },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', decimals: 2 },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$', decimals: 2 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '\u20a6', decimals: 2 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'EGP', decimals: 2 },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '\u20a8', decimals: 2 },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '\u09f3', decimals: 2 },
];

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

export function getCurrency(code: string): CurrencyInfo | undefined {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code);
}

export function isSupportedCurrency(code: string): boolean {
  return CURRENCY_CODES.includes(code);
}
