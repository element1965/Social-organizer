export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  country?: string; // Primary ISO country code for auto-detection
}

// Full list of major world currencies (ISO 4217)
export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  // Major currencies first
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, country: 'US' },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2, country: 'GB' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0, country: 'JP' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2, country: 'CH' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimals: 2, country: 'CA' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2, country: 'AU' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2, country: 'CN' },

  // Eastern Europe
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', decimals: 2, country: 'UA' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimals: 2, country: 'RU' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', decimals: 2, country: 'PL' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', decimals: 2, country: 'CZ' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', decimals: 0, country: 'HU' },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei', decimals: 2, country: 'RO' },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', decimals: 2, country: 'BG' },
  { code: 'HRK', name: 'Croatian Kuna', symbol: 'kn', decimals: 2, country: 'HR' },
  { code: 'RSD', name: 'Serbian Dinar', symbol: 'дин', decimals: 2, country: 'RS' },
  { code: 'MDL', name: 'Moldovan Leu', symbol: 'L', decimals: 2, country: 'MD' },
  { code: 'BYN', name: 'Belarusian Ruble', symbol: 'Br', decimals: 2, country: 'BY' },

  // Nordic
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimals: 2, country: 'SE' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', decimals: 2, country: 'NO' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', decimals: 2, country: 'DK' },
  { code: 'ISK', name: 'Icelandic Krona', symbol: 'kr', decimals: 0, country: 'IS' },

  // Middle East
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', decimals: 2, country: 'IL' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimals: 2, country: 'TR' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimals: 2, country: 'AE' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimals: 2, country: 'SA' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼', decimals: 2, country: 'QA' },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', decimals: 3, country: 'KW' },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'د.ب', decimals: 3, country: 'BH' },
  { code: 'OMR', name: 'Omani Rial', symbol: '﷼', decimals: 3, country: 'OM' },
  { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا', decimals: 3, country: 'JO' },
  { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل', decimals: 2, country: 'LB' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: '£', decimals: 2, country: 'EG' },
  { code: 'IRR', name: 'Iranian Rial', symbol: '﷼', decimals: 2, country: 'IR' },
  { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د', decimals: 3, country: 'IQ' },

  // Asia
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2, country: 'IN' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimals: 0, country: 'KR' },
  { code: 'TWD', name: 'Taiwan Dollar', symbol: 'NT$', decimals: 2, country: 'TW' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2, country: 'HK' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2, country: 'SG' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimals: 2, country: 'MY' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', decimals: 2, country: 'TH' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimals: 0, country: 'ID' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimals: 2, country: 'PH' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimals: 0, country: 'VN' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', decimals: 2, country: 'PK' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', decimals: 2, country: 'BD' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: '₨', decimals: 2, country: 'LK' },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: '₨', decimals: 2, country: 'NP' },
  { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K', decimals: 2, country: 'MM' },
  { code: 'KHR', name: 'Cambodian Riel', symbol: '៛', decimals: 2, country: 'KH' },
  { code: 'LAK', name: 'Lao Kip', symbol: '₭', decimals: 2, country: 'LA' },
  { code: 'MNT', name: 'Mongolian Tugrik', symbol: '₮', decimals: 2, country: 'MN' },
  { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸', decimals: 2, country: 'KZ' },
  { code: 'UZS', name: 'Uzbekistani Som', symbol: 'so\'m', decimals: 2, country: 'UZ' },
  { code: 'GEL', name: 'Georgian Lari', symbol: '₾', decimals: 2, country: 'GE' },
  { code: 'AMD', name: 'Armenian Dram', symbol: '֏', decimals: 2, country: 'AM' },
  { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼', decimals: 2, country: 'AZ' },

  // Americas
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', decimals: 2, country: 'MX' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimals: 2, country: 'BR' },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$', decimals: 2, country: 'AR' },
  { code: 'CLP', name: 'Chilean Peso', symbol: '$', decimals: 0, country: 'CL' },
  { code: 'COP', name: 'Colombian Peso', symbol: '$', decimals: 2, country: 'CO' },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', decimals: 2, country: 'PE' },
  { code: 'UYU', name: 'Uruguayan Peso', symbol: '$U', decimals: 2, country: 'UY' },
  { code: 'VES', name: 'Venezuelan Bolivar', symbol: 'Bs', decimals: 2, country: 'VE' },
  { code: 'BOB', name: 'Bolivian Boliviano', symbol: 'Bs.', decimals: 2, country: 'BO' },
  { code: 'PYG', name: 'Paraguayan Guarani', symbol: '₲', decimals: 0, country: 'PY' },
  { code: 'DOP', name: 'Dominican Peso', symbol: 'RD$', decimals: 2, country: 'DO' },
  { code: 'CRC', name: 'Costa Rican Colon', symbol: '₡', decimals: 2, country: 'CR' },
  { code: 'GTQ', name: 'Guatemalan Quetzal', symbol: 'Q', decimals: 2, country: 'GT' },
  { code: 'HNL', name: 'Honduran Lempira', symbol: 'L', decimals: 2, country: 'HN' },
  { code: 'NIO', name: 'Nicaraguan Cordoba', symbol: 'C$', decimals: 2, country: 'NI' },
  { code: 'PAB', name: 'Panamanian Balboa', symbol: 'B/.', decimals: 2, country: 'PA' },
  { code: 'JMD', name: 'Jamaican Dollar', symbol: 'J$', decimals: 2, country: 'JM' },
  { code: 'TTD', name: 'Trinidad Dollar', symbol: 'TT$', decimals: 2, country: 'TT' },

  // Africa
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2, country: 'ZA' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimals: 2, country: 'NG' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', decimals: 2, country: 'KE' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', decimals: 2, country: 'GH' },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.', decimals: 2, country: 'MA' },
  { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت', decimals: 3, country: 'TN' },
  { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج', decimals: 2, country: 'DZ' },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', decimals: 2, country: 'ET' },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', decimals: 0, country: 'UG' },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', decimals: 2, country: 'TZ' },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', decimals: 0, country: 'RW' },
  { code: 'XOF', name: 'West African CFA', symbol: 'CFA', decimals: 0 },
  { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA', decimals: 0 },

  // Oceania
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimals: 2, country: 'NZ' },
  { code: 'FJD', name: 'Fijian Dollar', symbol: 'FJ$', decimals: 2, country: 'FJ' },
];

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

export function isSupportedCurrency(code: string): boolean {
  return CURRENCY_CODES.includes(code);
}
