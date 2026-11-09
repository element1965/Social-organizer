import type { PrismaClient, Prisma } from '@so/db';
import { ADMIN_IDS } from '../admin.js';
import { deleteUserAccount } from './account-deletion.service.js';
import { sendTelegramMessage } from './telegram-bot.service.js';
import { sendPushNotification } from './push.service.js';
import { sendMail, isMailConfigured } from './mail.service.js';

/**
 * Automatic deletion of inactive accounts (product decision 2026-11-09).
 *
 * An account without authenticated activity for 2 years is deleted with the same logic as
 * the user-initiated `user.delete`. Activity = `User.lastSeen` (refreshed by the auth middleware;
 * falls back to `createdAt` when never set). Two notices go out first: 30 and 7 days before.
 * Any activity resets `inactivityStage` (see trpc.ts), so a user who signs in after a warning
 * starts a fresh 2-year period.
 *
 * Every step is idempotent: the stage is stored on the user, and a deletion always happens
 * at least 7 days after the second notice even if the 2-year mark has already passed
 * (e.g. accounts that were already old when this rule shipped).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const INACTIVITY_DAYS = 730; // 2 years
const FIRST_WARNING_DAYS = 30;
const SECOND_WARNING_DAYS = 7;
const BATCH_SIZE = 50;
/** Safety cap per run and per stage: spreads a large backlog over several daily runs. */
const MAX_PER_STAGE = 2000;

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';
const LOCK_KEY = 'so:inactive-account-cleanup';

export interface InactivityNotice {
  userId: string;
  stage: 1 | 2;
  deleteOn: Date;
  lang: 'ru' | 'en';
  text: string;
}

export interface InactiveCleanupOptions {
  /** Injectable clock for tests. */
  now?: Date;
  /** Injectable notifier for tests. Default sends Telegram, push and e-mail. */
  notify?: (db: PrismaClient, user: NoticeTarget, notice: InactivityNotice) => Promise<void>;
  /** Restrict the run to these user ids (tests). */
  onlyUserIds?: string[];
}

export interface InactiveCleanupResult {
  warned30: number;
  warned7: number;
  deleted: number;
  deletedSoft: number;
  skipped?: boolean;
}

export interface NoticeTarget {
  id: string;
  email: string | null;
  language: string;
  platformAccounts: Array<{ platformId: string }>;
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
export async function sendInactivityNotice(db: PrismaClient, user: NoticeTarget, notice: InactivityNotice): Promise<void> {
  const { subject } = noticeText(notice.lang, notice.deleteOn);
  const buttonText = notice.lang === 'ru' ? 'Войти' : 'Sign in';

  for (const acc of user.platformAccounts) {
    await sendTelegramMessage(acc.platformId, `${notice.text}\n\n${WEB_APP_URL}`, {
      inline_keyboard: [[{ text: buttonText, url: WEB_APP_URL }]],
    }).catch((err) => console.error('[InactiveCleanup] Telegram notice failed:', err));
  }

  await sendPushNotification(db, [user.id], { title: subject, body: notice.text, url: WEB_APP_URL })
    .catch((err) => console.error('[InactiveCleanup] Push notice failed:', err));

  if (user.email) {
    if (!isMailConfigured()) {
      console.log('[InactiveCleanup] Mail is not configured, e-mail notice skipped');
    } else {
      const html = `<p>${notice.text}</p><p><a href="${WEB_APP_URL}">${WEB_APP_URL}</a></p>`;
      await sendMail({ to: user.email, subject, text: `${notice.text}\n\n${WEB_APP_URL}`, html })
        .catch(() => console.log('[InactiveCleanup] E-mail notice could not be sent'));
    }
  }
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
    ...(ADMIN_IDS.length ? { id: { notIn: ADMIN_IDS } } : {}),
    ...(opts.onlyUserIds ? { AND: [{ id: { in: opts.onlyUserIds } }] } : {}),
  };
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

/** Iterates users matching `where` in id order, BATCH_SIZE at a time. */
async function forEachBatch(
  db: PrismaClient,
  where: Prisma.UserWhereInput,
  handle: (users: Prisma.UserGetPayload<{ select: typeof targetSelect }>[]) => Promise<void>,
): Promise<void> {
  let cursor: string | undefined;
  let seen = 0;
  while (seen < MAX_PER_STAGE) {
    const users = await db.user.findMany({
      where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
      select: targetSelect,
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (users.length === 0) return;
    seen += users.length;
    cursor = users[users.length - 1]!.id;
    await handle(users);
    if (users.length < BATCH_SIZE) return;
  }
}

const langOf = (language: string): 'ru' | 'en' => (language?.toLowerCase().startsWith('ru') ? 'ru' : 'en');
const lastActivity = (u: { lastSeen: Date | null; createdAt: Date }) => u.lastSeen ?? u.createdAt;

/**
 * One pass of the routine. Safe to call repeatedly; does not take the lock
 * (use `runInactiveCleanupLocked` from schedulers).
 */
export async function runInactiveCleanup(
  db: PrismaClient,
  opts: InactiveCleanupOptions = {},
): Promise<InactiveCleanupResult> {
  const now = opts.now ?? new Date();
  const notify = opts.notify ?? sendInactivityNotice;
  const result: InactiveCleanupResult = { warned30: 0, warned7: 0, deleted: 0, deletedSoft: 0 };
  const base = baseWhere(opts);
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

  // Stage 2 → delete: past the 2-year mark and at least 7 days after the second notice.
  await forEachBatch(db, {
    AND: [base, inactiveSince(daysAgo(INACTIVITY_DAYS)), { inactivityStage: 2, inactivityWarnedAt: { lte: daysAgo(SECOND_WARNING_DAYS) } }],
  }, async (users) => {
    for (const u of users) {
      // Re-check right before deleting: the user may have signed in since the batch was read.
      const fresh = await db.user.findUnique({
        where: { id: u.id },
        select: { lastSeen: true, createdAt: true, inactivityStage: true, deletedAt: true },
      });
      if (!fresh || fresh.deletedAt || fresh.inactivityStage !== 2) continue;
      if (lastActivity(fresh).getTime() > daysAgo(INACTIVITY_DAYS).getTime()) continue;
      try {
        const res = await deleteUserAccount(db, u.id);
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
  await forEachBatch(db, {
    AND: [base, inactiveSince(daysAgo(INACTIVITY_DAYS - SECOND_WARNING_DAYS)), {
      inactivityStage: 1,
      inactivityWarnedAt: { lte: daysAgo(FIRST_WARNING_DAYS - SECOND_WARNING_DAYS) },
    }],
  }, async (users) => {
    for (const u of users) {
      const deadline = lastActivity(u).getTime() + INACTIVITY_DAYS * DAY_MS;
      const deleteOn = new Date(Math.max(deadline, now.getTime() + SECOND_WARNING_DAYS * DAY_MS));
      await warn(db, u, 2, deleteOn, notify, now);
      result.warned7++;
    }
  });

  // Stage 0 → 1: within 30 days of the mark.
  await forEachBatch(db, {
    AND: [base, inactiveSince(daysAgo(INACTIVITY_DAYS - FIRST_WARNING_DAYS)), { inactivityStage: 0 }],
  }, async (users) => {
    for (const u of users) {
      const deadline = lastActivity(u).getTime() + INACTIVITY_DAYS * DAY_MS;
      const deleteOn = new Date(Math.max(deadline, now.getTime() + FIRST_WARNING_DAYS * DAY_MS));
      await warn(db, u, 1, deleteOn, notify, now);
      result.warned30++;
    }
  });

  console.log(`[InactiveCleanup] Done: warned30=${result.warned30}, warned7=${result.warned7}, deleted=${result.deleted} (soft ${result.deletedSoft})`);
  return result;
}

async function warn(
  db: PrismaClient,
  u: Prisma.UserGetPayload<{ select: typeof targetSelect }>,
  stage: 1 | 2,
  deleteOn: Date,
  notify: NonNullable<InactiveCleanupOptions['notify']>,
  now: Date,
): Promise<void> {
  // Record the stage first (only if unchanged), so a crash never repeats a notice.
  const { count } = await db.user.updateMany({
    where: { id: u.id, inactivityStage: stage - 1, deletedAt: null },
    data: { inactivityStage: stage, inactivityWarnedAt: now },
  });
  if (count === 0) return;
  const lang = langOf(u.language);
  const { text } = noticeText(lang, deleteOn);
  try {
    await notify(db, u, { userId: u.id, stage, deleteOn, lang, text });
  } catch (err) {
    console.error('[InactiveCleanup] Notice failed:', err);
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
  const skipped: InactiveCleanupResult = { warned30: 0, warned7: 0, deleted: 0, deletedSoft: 0, skipped: true };
  if (running) return skipped;
  running = true;
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_KEY})::bigint) AS locked`;
      if (!rows[0]?.locked) {
        console.log('[InactiveCleanup] Another run holds the lock, skipping');
        return skipped;
      }
      return runInactiveCleanup(db, opts);
    }, { maxWait: 10_000, timeout: 60 * 60 * 1000 });
  } finally {
    running = false;
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
