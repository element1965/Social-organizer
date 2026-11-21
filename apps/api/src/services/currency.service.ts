const EXCHANGE_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';
// Default rates as fallback (approximate values)
const DEFAULT_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  UAH: 41.5,
  RUB: 92,
  PLN: 4.0,
  ILS: 3.7,
  JPY: 149,
  CNY: 7.2,
  INR: 83,
  BRL: 5.0,
  CAD: 1.36,
  AUD: 1.54,
  CHF: 0.88,
  KRW: 1330,
  MXN: 17.2,
  TRY: 32,
  ZAR: 18.5,
  SEK: 10.5,
  NOK: 10.8,
  DKK: 6.9,
  CZK: 23.5,
  HUF: 360,
  RON: 4.6,
  BGN: 1.8,
  HRK: 7.0,
  THB: 35,
  SGD: 1.34,
  HKD: 7.8,
  NZD: 1.66,
  PHP: 56,
  IDR: 15700,
  MYR: 4.7,
  VND: 24500,
  AED: 3.67,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.31,
  BHD: 0.38,
  OMR: 0.38,
  EGP: 31,
  PKR: 280,
  BDT: 110,
  NGN: 1550,
  KES: 155,
  GHS: 12.5,
  TWD: 32,
  ARS: 870,
  CLP: 950,
  COP: 4000,
  PEN: 3.75,
};

export async function getExchangeRates(): Promise<Record<string, number>> {
  // Fetch from API
  try {
    const res = await fetch(EXCHANGE_API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates: Record<string, number> };
    return data.rates;
  } catch {
    // Return default rates if API fails
    return DEFAULT_RATES;
  }
}

export async function convertToUSD(amount: number, fromCurrency: string): Promise<number> {
  if (fromCurrency === 'USD') return Math.round(amount);

  const rates = await getExchangeRates();
  const rate = rates[fromCurrency];
  if (!rate) {
    console.warn(`Unknown currency: ${fromCurrency}, using 1:1 conversion`);
    return Math.round(amount);
  }

  // USD = amount / rate (since rates are in format: 1 USD = X currency)
  return Math.round(amount / rate);
}

export async function convertFromUSD(amountUSD: number, toCurrency: string): Promise<number> {
  if (toCurrency === 'USD') return amountUSD;

  const rates = await getExchangeRates();
  const rate = rates[toCurrency];
  if (!rate) {
    console.warn(`Unknown currency: ${toCurrency}, using 1:1 conversion`);
    return amountUSD;
  }

  return Math.round(amountUSD * rate);
}
