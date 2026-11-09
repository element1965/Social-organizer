import type { PrismaClient, Prisma } from '@so/db';
import { ADMIN_IDS, CLUSTER_ROOT_OVERRIDE } from '../admin.js';
import { deleteUserAccount } from './account-deletion.service.js';
import { sendTelegramMessage } from './telegram-bot.service.js';
import { sendPushNotification } from './push.service.js';
import { sendMail, isMailConfigured } from './mail.service.js';

/**
 * Automatic deletion of inactive accounts (product decision 2026-11-09).
 *
 * An account without activity for 2 years is deleted with the same logic as the user-initiated
 * `user.delete`. Activity = `User.lastSeen` (refreshed by `touchUser`: every authenticated request,
 * sign-in / refresh / link code, bot interaction; falls back to `createdAt` when never set).
 * Two notices go out first: 30 and 7 days before. Any activity resets `inactivityStage`,
 * so a user who signs in after a notice starts a fresh 2-year period.
 *
 * Every step is idempotent: the stage is stored on the user, and a deletion always happens
 * at least 7 days after the second notice even if the 2-year mark has already passed
 * (e.g. accounts that were already old when this rule shipped).
 *
 * Undelivered notices do not block deletion (the rule is public on /delete-account and in the
 * privacy policy); each run logs how many notices reached no channel.
 *
 * Never processed: deleted users, AUTHOR / DEVELOPER roles, ADMIN_IDS, the CLUSTER_ROOT_OVERRIDE
 * accounts, and authors of an ACTIVE / BLOCKED collection with a pledge from another person.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const INACTIVITY_DAYS = 730; // 2 years
const FIRST_WARNING_DAYS = 30;
const SECOND_WARNING_DAYS = 7;
const BATCH_SIZE = 50;
/** Safety cap per run and per stage: spreads a large backlog over several daily runs. */
const MAX_PER_STAGE = 300;

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';
const LOCK_KEY = 'so:inactive-account-cleanup';
const PROTECTED_IDS = [...ADMIN_IDS, CLUSTER_ROOT_OVERRIDE.member, CLUSTER_ROOT_OVERRIDE.root];

export interface InactivityNotice {
  userId: string;
  stage: 1 | 2;
  deleteOn: Date;
  lang: 'ru' | 'en';
  text: string;
}

export interface NoticeTarget {
  id: string;
  email: string | null;
  language: string;
  platformAccounts: Array<{ platformId: string }>;
}

/** Returns how many channels accepted the notice (0 = reached no channel). */
export type InactivityNotifier = (db: PrismaClient, user: NoticeTarget, notice: InactivityNotice) => Promise<number>;

export interface InactiveCleanupOptions {
  /** Injectable clock for tests. */
  now?: Date;
  /** Injectable notifier for tests. Default sends Telegram, push and e-mail. */
  notify?: InactivityNotifier;
  /** Restrict the run to these user ids (tests). */
  onlyUserIds?: string[];
}

export interface InactiveCleanupResult {
  warned30: number;
  warned7: number;
  undelivered: number;
  exempt: number;
  deleted: number;
  deletedSoft: number;
  skipped?: boolean;
}

function noticeText(lang: 'ru' | 'en', deleteOn: Date): { subject: string; text: string } {
  if (lang === 'ru') {
    const date = deleteOn.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
      subject: 'Ваш профиль в Social Organizer будет удалён',
      text: `Ваш профиль в Social Organizer будет удалён ${date}, потому что вы не заходили 2 года. Чтобы сохранить его, просто войдите.`,
    };
  }
  const date = deleteOn.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    subject: 'Your Social Organizer profile will be deleted',
    text: `Your Social Organizer profile will be deleted on ${date} because you have not signed in for 2 years. To keep it, just sign in.`,
  };
}

/** Default notifier: every channel the user has; failures are logged, never thrown. */
export async function sendInactivityNotice(db: PrismaClient, user: NoticeTarget, notice: InactivityNotice): Promise<number> {
  const { subject } = noticeText(notice.lang, notice.deleteOn);
  const buttonText = notice.lang === 'ru' ? 'Открыть Social Organizer' : 'Open Social Organizer';
  let delivered = 0;

  // Telegram: Mini App button (private chat with the bot). keepOnBlocked: a blocked bot only
  // means this channel failed — the notice path must never remove anyone by itself.
  for (const acc of user.platformAccounts) {
    const ok = await sendTelegramMessage(acc.platformId, `${notice.text}\n\n${WEB_APP_URL}`, {
      inline_keyboard: [[{ text: buttonText, web_app: { url: WEB_APP_URL } }]],
    }, { keepOnBlocked: true }).catch((err) => {
      console.error('[InactiveCleanup] Telegram notice failed:', err);
      return false;
    });
    if (ok) delivered++;
  }

  // Push: the sender does not report per-device results; count it when the user has devices.
  const [webSubs, nativeTokens] = await Promise.all([
    db.pushSubscription.count({ where: { userId: user.id } }),
    db.nativePushToken.count({ where: { userId: user.id } }),
  ]);
  if (webSubs + nativeTokens > 0) {
    try {
      await sendPushNotification(db, [user.id], { title: subject, body: notice.text, url: WEB_APP_URL });
      delivered++;
    } catch (err) {
      console.error('[InactiveCleanup] Push notice failed:', err);
    }
  }

  // E-mail: only through a configured mail service.
  if (user.email && isMailConfigured()) {
    const html = `<p>${notice.text}</p><p><a href="${WEB_APP_URL}">${WEB_APP_URL}</a></p>`;
    try {
      await sendMail({ to: user.email, subject, text: `${notice.text}\n\n${WEB_APP_URL}`, html });
      delivered++;
    } catch {
      console.log('[InactiveCleanup] E-mail notice could not be sent');
    }
  }
  return delivered;
}

/** Users whose last activity (lastSeen, else createdAt) is at or before `cutoff`. */
function inactiveSince(cutoff: Date): Prisma.UserWhereInput {
  return {
    OR: [
      { lastSeen: { lte: cutoff } },
      { lastSeen: null, createdAt: { lte: cutoff } },
    ],
  };
}

function baseWhere(opts: InactiveCleanupOptions): Prisma.UserWhereInput {
  return {
    deletedAt: null,
    role: 'REGULAR', // AUTHOR / DEVELOPER are never auto-deleted
    id: { notIn: PROTECTED_IDS },
    ...(opts.onlyUserIds ? { AND: [{ id: { in: opts.onlyUserIds } }] } : {}),
  };
}

/** Author of an ACTIVE / BLOCKED collection that another person has pledged to. */
async function holdsLiveCollection(db: PrismaClient | Prisma.TransactionClient, userId: string): Promise<boolean> {
  const n = await db.obligation.count({
    where: {
      userId: { not: userId },
      collection: { creatorId: userId, status: { in: ['ACTIVE', 'BLOCKED'] } },
    },
  });
  return n > 0;
}

const targetSelect = {
  id: true,
  email: true,
  language: true,
  lastSeen: true,
  createdAt: true,
  inactivityStage: true,
  inactivityWarnedAt: true,
  platformAccounts: { where: { platform: 'TELEGRAM' as const }, select: { platformId: true } },
} satisfies Prisma.UserSelect;
type Target = Prisma.UserGetPayload<{ select: typeof targetSelect }>;

/** Iterates users matching `where` in id order, BATCH_SIZE at a time, up to MAX_PER_STAGE. */
async function forEachBatch(
  db: PrismaClient,
  where: Prisma.UserWhereInput,
  handle: (users: Target[]) => Promise<void>,
): Promise<void> {
  let cursor: string | undefined;
  let seen = 0;
  while (seen < MAX_PER_STAGE) {
    const users = await db.user.findMany({
      where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
      select: targetSelect,
      orderBy: { id: 'asc' },
      take: Math.min(BATCH_SIZE, MAX_PER_STAGE - seen),
    });
    if (users.length === 0) return;
    seen += users.length;
    cursor = users[users.length - 1]!.id;
    await handle(users);
  }
}

const langOf = (language: string): 'ru' | 'en' => (language?.toLowerCase().startsWith('ru') ? 'ru' : 'en');
const lastActivity = (u: { lastSeen: Date | null; createdAt: Date }) => u.lastSeen ?? u.createdAt;

/**
 * One pass of the routine. Safe to call repeatedly; does not take the lock
 * (schedulers use `runInactiveCleanupLocked`).
 */
export async function runInactiveCleanup(
  db: PrismaClient,
  opts: InactiveCleanupOptions = {},
): Promise<InactiveCleanupResult> {
  const now = opts.now ?? new Date();
  const notify = opts.notify ?? sendInactivityNotice;
  const result: InactiveCleanupResult = { warned30: 0, warned7: 0, undelivered: 0, exempt: 0, deleted: 0, deletedSoft: 0 };
  const base = baseWhere(opts);
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const exemptSeen = new Set<string>();
  const isExempt = async (id: string) => {
    if (!(await holdsLiveCollection(db, id))) return false;
    if (!exemptSeen.has(id)) { exemptSeen.add(id); result.exempt++; }
    return true;
  };

  // Stage 2 → delete: past the 2-year mark and at least 7 days after the second notice.
  const deleteCutoff = daysAgo(INACTIVITY_DAYS);
  await forEachBatch(db, {
    AND: [base, inactiveSince(deleteCutoff), { inactivityStage: 2, inactivityWarnedAt: { lte: daysAgo(SECOND_WARNING_DAYS) } }],
  }, async (users) => {
    for (const u of users) {
      if (await isExempt(u.id)) continue;
      try {
        // Final check inside the deletion transaction, with the user row locked:
        // a sign-in between the batch read and now keeps the account.
        const res = await deleteUserAccount(db, u.id, {
          guard: async (tx) => {
            const fresh = await tx.user.findUnique({
              where: { id: u.id },
              select: { lastSeen: true, createdAt: true, inactivityStage: true, deletedAt: true },
            });
            if (!fresh || fresh.deletedAt || fresh.inactivityStage !== 2) return false;
            if (lastActivity(fresh).getTime() > deleteCutoff.getTime()) return false;
            return !(await holdsLiveCollection(tx, u.id));
          },
        });
        if (res) {
          result.deleted++;
          if (res.mode === 'soft') result.deletedSoft++;
        }
      } catch (err) {
        console.error('[InactiveCleanup] Failed to delete a user:', err);
      }
    }
  });

  // Stage 1 → 2: within 7 days of the mark and at least 23 days after the first notice.
  const secondCutoff = daysAgo(INACTIVITY_DAYS - SECOND_WARNING_DAYS);
  await forEachBatch(db, {
    AND: [base, inactiveSince(secondCutoff), {
      inactivityStage: 1,
      inactivityWarnedAt: { lte: daysAgo(FIRST_WARNING_DAYS - SECOND_WARNING_DAYS) },
    }],
  }, async (users) => {
    for (const u of users) {
      if (await isExempt(u.id)) continue;
      const deadline = lastActivity(u).getTime() + INACTIVITY_DAYS * DAY_MS;
      const deleteOn = new Date(Math.max(deadline, now.getTime() + SECOND_WARNING_DAYS * DAY_MS));
      const sent = await warn(db, u, 2, secondCutoff, deleteOn, notify, now);
      if (sent === null) continue;
      result.warned7++;
      if (sent === 0) result.undelivered++;
    }
  });

  // Stage 0 → 1: within 30 days of the mark.
  const firstCutoff = daysAgo(INACTIVITY_DAYS - FIRST_WARNING_DAYS);
  await forEachBatch(db, {
    AND: [base, inactiveSince(firstCutoff), { inactivityStage: 0 }],
  }, async (users) => {
    for (const u of users) {
      if (await isExempt(u.id)) continue;
      const deadline = lastActivity(u).getTime() + INACTIVITY_DAYS * DAY_MS;
      const deleteOn = new Date(Math.max(deadline, now.getTime() + FIRST_WARNING_DAYS * DAY_MS));
      const sent = await warn(db, u, 1, firstCutoff, deleteOn, notify, now);
      if (sent === null) continue;
      result.warned30++;
      if (sent === 0) result.undelivered++;
    }
  });

  console.log(`[InactiveCleanup] Done: warned30=${result.warned30}, warned7=${result.warned7}, undelivered=${result.undelivered}, exempt=${result.exempt}, deleted=${result.deleted} (soft ${result.deletedSoft})`);
  return result;
}

/** Records the stage (guarded) and sends the notice. Returns channels reached, or null if not recorded. */
async function warn(
  db: PrismaClient,
  u: Target,
  stage: 1 | 2,
  cutoff: Date,
  deleteOn: Date,
  notify: InactivityNotifier,
  now: Date,
): Promise<number | null> {
  // Record the stage first, only if unchanged and still inactive, so a crash never repeats
  // a notice and a concurrent sign-in never gets one.
  const { count } = await db.user.updateMany({
    where: { AND: [{ id: u.id, inactivityStage: stage - 1, deletedAt: null }, inactiveSince(cutoff)] },
    data: { inactivityStage: stage, inactivityWarnedAt: now },
  });
  if (count === 0) return null;
  const lang = langOf(u.language);
  const { text } = noticeText(lang, deleteOn);
  try {
    return await notify(db, u, { userId: u.id, stage, deleteOn, lang, text });
  } catch (err) {
    console.error('[InactiveCleanup] Notice failed:', err);
    return 0;
  }
}

let running = false;

/**
 * Scheduler entry point: one run at a time per process (flag) and across replicas
 * (Postgres transaction-level advisory lock, held by an otherwise idle transaction).
 */
export async function runInactiveCleanupLocked(
  db: PrismaClient,
  opts: InactiveCleanupOptions = {},
): Promise<InactiveCleanupResult> {
  const skipped: InactiveCleanupResult = { warned30: 0, warned7: 0, undelivered: 0, exempt: 0, deleted: 0, deletedSoft: 0, skipped: true };
  if (running) return skipped;
  running = true;
  let completed: InactiveCleanupResult | null = null;
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_KEY})::bigint) AS locked`;
      if (!rows[0]?.locked) {
        console.log('[InactiveCleanup] Another run holds the lock, skipping');
        return skipped;
      }
      completed = await runInactiveCleanup(db, opts);
      return completed;
    }, { maxWait: 10_000, timeout: 60 * 60 * 1000 });
  } catch (err) {
    // The work is done and committed row by row; only releasing the lock transaction failed
    // (e.g. it outlived the timeout). The lock is released with the transaction anyway.
    if (completed) {
      console.warn('[InactiveCleanup] Run finished, lock transaction did not commit cleanly:', (err as Error)?.message);
      return completed;
    }
    throw err;
  } finally {
    running = false;
  }
}

/** Startup warnings for the cleanup configuration. */
export function logInactiveCleanupConfig(): void {
  if (ADMIN_IDS.length === 0) {
    console.warn('[InactiveCleanup] ADMIN_IDS is empty: admin accounts are not protected from inactivity deletion');
  }
}

/** Fallback scheduler when Redis is not configured: first run after a delay, then every 24 h. */
export function startInactiveCleanupTimer(db: PrismaClient, firstDelayMs = 5 * 60 * 1000): void {
  const tick = () => {
    runInactiveCleanupLocked(db).catch((err) => console.error('[InactiveCleanup] Run failed:', err));
  };
  setTimeout(() => {
    tick();
    setInterval(tick, DAY_MS).unref();
  }, firstDelayMs).unref();
  console.log(`[InactiveCleanup] In-process timer armed (first run in ${Math.round(firstDelayMs / 60000)} min, then every 24 h)`);
}
