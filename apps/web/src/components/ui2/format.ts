/** "1 240 $" — thin space as the thousands separator, currency sign after the number. */
export function formatMoney(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const body = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  return `${sign}${body} $`;
}
