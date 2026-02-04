import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { SUPPORTED_CURRENCIES } from '@so/shared';
import { convertToUSD, convertFromUSD, getExchangeRates } from '../services/currency.service.js';

// Note: getCountryByIP and getCurrencyByCountry are available in geo.service.ts
// for future IP-based currency detection implementation

export const currencyRouter = router({
  // Get list of all supported currencies
  list: publicProcedure.query(() => {
    return SUPPORTED_CURRENCIES;
  }),

  // Detect recommended currency based on user's IP (simplified - returns USD as default)
  detectCurrency: publicProcedure.query(async () => {
    // In production, would get IP from request headers
    // For now, return USD as default
    return { currency: 'USD', country: null };
  }),

  // Get current exchange rates (cached)
  rates: publicProcedure.query(async () => {
    const rates = await getExchangeRates();
    return rates;
  }),

  // Convert amount between currencies (for preview)
  convert: publicProcedure
    .input(z.object({
      amount: z.number().min(0),
      from: z.string(),
      to: z.string(),
    }))
    .query(async ({ input }) => {
      if (input.from === input.to) {
        return { result: input.amount, rate: 1 };
      }

      // Convert through USD
      const usd = await convertToUSD(input.amount, input.from);
      const result = input.to === 'USD' ? usd : await convertFromUSD(usd, input.to);

      // Calculate effective rate
      const rate = input.amount > 0 ? result / input.amount : 0;

      return { result, rate };
    }),

  // Convert to USD (returns integer)
  toUSD: publicProcedure
    .input(z.object({
      amount: z.number().min(0),
      from: z.string(),
    }))
    .query(async ({ input }) => {
      const result = await convertToUSD(input.amount, input.from);
      return { result };
    }),
});
