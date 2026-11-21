import { groupNumber } from '@so/shared';

/** "1 240 $" with non-breaking spaces and a trailing currency sign. */
export function formatMoney(amount: number): string {
  return `${groupNumber(Math.round(amount))}\u00a0$`;
}

/** Isolate the whole amount left-to-right when it is interpolated into a sentence. */
export function formatIsolatedMoney(amount: number): string {
  return `\u2066${formatMoney(amount)}\u2069`;
}
