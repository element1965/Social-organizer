const raw = process.env.ADMIN_IDS ?? '';

export const ADMIN_IDS: string[] = raw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function isAdmin(userId: string): boolean {
  return ADMIN_IDS.includes(userId);
}
