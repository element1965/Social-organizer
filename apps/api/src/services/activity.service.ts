import type { PrismaClient } from '@so/db';

/**
 * Activity heartbeat. `lastSeen` drives "online" display and the 2-year inactivity cleanup;
 * any activity also cancels pending inactivity warnings (inactivityStage → 0).
 *
 * Called from the tRPC auth middleware, successful sign-in / refresh / link-code flows and
 * Telegram bot updates of linked accounts. Throttled per process to one write per minute
 * per user, fire-and-forget: it never throws and never slows the caller.
 */

export const TOUCH_THROTTLE_MS = 60 * 1000;
const MAX_TRACKED = 50_000;

const lastTouch = new Map<string, number>();
const lastTgTouch = new Map<string, number>();

// Deploy order guard: if the inactivity columns are not migrated yet, fall back to lastSeen only.
let inactivityColumnsMissing = false;

function throttled(map: Map<string, number>, key: string, now: number): boolean {
  const prev = map.get(key);
  if (prev !== undefined && now - prev < TOUCH_THROTTLE_MS) return true;
  if (map.size >= MAX_TRACKED) map.clear();
  map.set(key, now);
  return false;
}

function isMissingColumn(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | undefined;
  return e?.code === 'P2022' || /inactivity(Stage|WarnedAt)/.test(e?.message ?? '');
}

/** Refresh lastSeen and reset the inactivity stage. Returns when the write is done (or skipped). */
export async function touchUserNow(db: PrismaClient, userId: string): Promise<void> {
  const now = new Date();
  if (throttled(lastTouch, userId, now.getTime())) return;
  try {
    if (!inactivityColumnsMissing) {
      try {
        await db.user.updateMany({
          where: { id: userId, deletedAt: null },
          data: { lastSeen: now, inactivityStage: 0, inactivityWarnedAt: null },
        });
        return;
      } catch (err) {
        if (!isMissingColumn(err)) throw err;
        inactivityColumnsMissing = true;
        console.warn('[Activity] Inactivity columns missing (migration 20261109180000 not applied) — updating lastSeen only');
      }
    }
    await db.user.updateMany({ where: { id: userId, deletedAt: null }, data: { lastSeen: now } });
  } catch {
    // Heartbeat only: a failed write must never break the request.
    lastTouch.delete(userId);
  }
}

/** Fire-and-forget variant for request paths. */
export function touchUser(db: PrismaClient, userId: string): void {
  void touchUserNow(db, userId);
}

/** Bot interaction from a Telegram account: touch the linked user, if any. */
export function touchTelegramUser(db: PrismaClient, telegramId: string | number | undefined): void {
  if (telegramId === undefined) return;
  const key = String(telegramId);
  if (throttled(lastTgTouch, key, Date.now())) return;
  db.platformAccount.findFirst({
    where: { platform: 'TELEGRAM', platformId: key },
    select: { userId: true },
  })
    .then((acc) => (acc ? touchUserNow(db, acc.userId) : undefined))
    .catch(() => lastTgTouch.delete(key));
}
