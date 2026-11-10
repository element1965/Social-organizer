/** Day number since registration, counted by calendar days in Kyiv time (day 1 = the sign-up day). */
export function kyivDayCount(createdAt: Date | string, now: Date = new Date()): number {
  const kyivDate = (value: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
    return Date.parse(`${parts}T00:00:00Z`);
  };
  const diff = kyivDate(now) - kyivDate(new Date(createdAt));
  return Math.floor(diff / 86_400_000) + 1;
}
