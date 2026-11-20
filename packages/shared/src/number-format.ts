/** Group the integer digits without changing the sign or decimal precision. */
export function groupNumber(amount: number): string {
  return String(amount).replace(/^-?\d+(?=\.|$)/, (integer) =>
    integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'),
  );
}

/** Preserve the locale's punctuation and currency placement while keeping spaced numbers together. */
export function formatUnbrokenNumber(formatter: Intl.NumberFormat, amount: number): string {
  return formatter.format(amount).replace(/[^\S\u00a0\u202f]/g, '\u202f');
}
