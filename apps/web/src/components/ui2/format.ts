import { groupNumber } from '@so/shared';

/** "1 240 $" with non-breaking spaces and a trailing currency sign. */
export function formatMoney(amount: number): string {
  return `${groupNumber(Math.round(amount))}\u00a0$`;
}
