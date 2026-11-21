import type { Campaign } from '@so/shared';
import { createUserWithReferralSlug } from './referral-slug.service.js';
import crypto from 'node:crypto';
import type { PrismaClient } from '@so/db';
import { DEFAULT_INTENTION_AMOUNT } from '@so/shared';
import { sendMail } from './mail.service.js';
import { isUniqueViolation } from './identity.service.js';
import { restoreMutedAccount } from './account-restore.service.js';
import { markEmailProvenFirstTime } from './email-proof.service.js';
import { sessionClockDate } from './session-clock.js';

/**
 * Sign-in with a one-time e-mail code (SO-21).
 *
 * Limits (on top of the per-IP limit for sign-in procedures, 30 per 15 min, SO-14):
 * - 6-digit code, valid 10 minutes, only the latest code works;
 * - a new code no sooner than 60 s after the previous one, at most 5 codes per address per hour;
 * - 5 wrong entries burn the code.
 * The answer to "send a code" is the same whether the address is registered or not.
 * Only an HMAC of the code is stored; codes and tokens are never logged.
 */

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_RESEND_MS = 60 * 1000;
export const EMAIL_CODE_MAX_PER_HOUR = 5;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export type EmailCodeErrorCode =
  | 'RESEND_TOO_SOON'
  | 'TOO_MANY_CODES'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'TOO_MANY_ATTEMPTS';

export class EmailCodeError extends Error {
  constructor(public code: EmailCodeErrorCode, public retryInSec?: number, public attemptsLeft?: number) {
    super(code);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashCode(email: string, code: string): string {
  // auth.service.ts refuses to start without JWT_SECRET; never fall back to a known value
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return crypto.createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

const TEXTS: Record<string, { subject: (c: string) => string; body: (c: string) => string }> = {
  ru: {
    subject: (c) => `${c} — код для входа в Social Organizer`,
    body: (c) => `Ваш код для входа: ${c}\n\nКод действует 10 минут. Если вы не запрашивали вход, просто проигнорируйте это письмо.`,
  },
  uk: {
    subject: (c) => `${c} — код для входу в Social Organizer`,
    body: (c) => `Ваш код для входу: ${c}\n\nКод дійсний 10 хвилин. Якщо ви не запитували вхід, просто проігноруйте цей лист.`,
  },
  en: {
    subject: (c) => `${c} is your Social Organizer sign-in code`,
    body: (c) => `Your sign-in code: ${c}\n\nThe code is valid for 10 minutes. If you did not try to sign in, just ignore this e-mail.`,
  },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Sends a fresh code. Returns seconds until another code may be requested. */
export async function requestEmailCode(db: PrismaClient, rawEmail: string, lang = 'en'): Promise<{ resendInSec: number }> {
  const email = normalizeEmail(rawEmail);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

  // One issuance at a time per address (SEC-4): the limit check and the new row are one transaction under a
  // lock on the normalized address, so concurrent requests cannot all pass the check before any row exists.
  await db.$transaction(async (tx) => {
    // 64-bit key, domain-separated from the other advisory locks (Need creation, push subscriptions)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`email-code:${email}`}, 0))`;
    const now = Date.now();
    const recent = await tx.emailLoginCode.findMany({
      where: { email, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const last = recent[0];
    if (last && now - last.createdAt.getTime() < EMAIL_CODE_RESEND_MS) {
      throw new EmailCodeError('RESEND_TOO_SOON', Math.ceil((EMAIL_CODE_RESEND_MS - (now - last.createdAt.getTime())) / 1000));
    }
    if (recent.length >= EMAIL_CODE_MAX_PER_HOUR) {
      const oldest = recent[recent.length - 1]!;
      throw new EmailCodeError('TOO_MANY_CODES', Math.ceil((oldest.createdAt.getTime() + 60 * 60 * 1000 - now) / 1000));
    }
    // Only the latest code works
    await tx.emailLoginCode.updateMany({ where: { email, consumedAt: null }, data: { consumedAt: new Date(now) } });
    await tx.emailLoginCode.create({
      data: { email, codeHash: hashCode(email, code), createdAt: new Date(now), expiresAt: new Date(now + EMAIL_CODE_TTL_MS) },
    });
  });

  const t = TEXTS[lang.slice(0, 2)] ?? TEXTS.en!;
  const text = t.body(code);
  await sendMail({
    to: email,
    subject: t.subject(code),
    text,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${escapeHtml(text)
      .replace(code, `<b style="font-size:22px;letter-spacing:3px">${code}</b>`)
      .replace(/\n/g, '<br>')}</div>`,
  });
  return { resendInSec: EMAIL_CODE_RESEND_MS / 1000 };
}

/** Checks the code and returns the user (existing or new) for this proven address. */
export async function verifyEmailCode(db: PrismaClient, rawEmail: string, code: string, campaign?: Campaign): Promise<{ userId: string; isNew: boolean }> {
  const email = normalizeEmail(rawEmail);
  const latest = await db.emailLoginCode.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
  if (!latest || latest.consumedAt) throw new EmailCodeError('INVALID_CODE');
  if (latest.expiresAt.getTime() < Date.now()) throw new EmailCodeError('CODE_EXPIRED');
  if (latest.attempts >= EMAIL_CODE_MAX_ATTEMPTS) throw new EmailCodeError('TOO_MANY_ATTEMPTS');

  // Reserve this attempt before comparing (SEC-4): one conditional increment per check, so concurrent
  // guesses can never make more than EMAIL_CODE_MAX_ATTEMPTS comparisons against one code. Expiry is part of
  // the predicate, on the database clock, so a request delayed past the expiry cannot still reserve.
  // Columns are timestamp(3) in UTC; now() AT TIME ZONE 'UTC' compares them whatever the session time zone.
  const reserved = await db.$queryRaw<Array<{ attempts: number }>>`
    UPDATE email_login_codes SET attempts = attempts + 1
    WHERE id = ${latest.id} AND "consumedAt" IS NULL AND attempts < ${EMAIL_CODE_MAX_ATTEMPTS}
      AND "expiresAt" > (now() AT TIME ZONE 'UTC')
    RETURNING attempts`;
  const attempts = reserved[0]?.attempts;
  if (attempts == null) throw new EmailCodeError(await refusalOf(db, latest.id, 'TOO_MANY_ATTEMPTS'));

  const expected = Buffer.from(latest.codeHash, 'hex');
  const given = Buffer.from(hashCode(email, code), 'hex');
  if (!crypto.timingSafeEqual(expected, given)) {
    const left = EMAIL_CODE_MAX_ATTEMPTS - attempts;
    if (left <= 0) throw new EmailCodeError('TOO_MANY_ATTEMPTS');
    throw new EmailCodeError('INVALID_CODE', undefined, left);
  }

  // One use: a second request with the same code (double tap, two devices) gets nothing. Still unexpired
  // on the database clock at the moment it is spent.
  const used = await db.$executeRaw`
    UPDATE email_login_codes SET "consumedAt" = (now() AT TIME ZONE 'UTC')
    WHERE id = ${latest.id} AND email = ${email} AND "consumedAt" IS NULL
      AND "expiresAt" > (now() AT TIME ZONE 'UTC')`;
  if (used === 0) throw new EmailCodeError(await refusalOf(db, latest.id, 'INVALID_CODE'));

  return findOrCreateEmailUser(db, email, campaign);
}

/** Why a conditional update of a code matched nothing: used or replaced, expired, or else `otherwise`. */
async function refusalOf(db: PrismaClient, id: string, otherwise: EmailCodeErrorCode): Promise<EmailCodeErrorCode> {
  const rows = await db.$queryRaw<Array<{ consumed: boolean; expired: boolean }>>`
    SELECT "consumedAt" IS NOT NULL AS consumed, "expiresAt" <= (now() AT TIME ZONE 'UTC') AS expired
    FROM email_login_codes WHERE id = ${id}`;
  const row = rows[0];
  if (!row || row.consumed) return 'INVALID_CODE';
  if (row.expired) return 'CODE_EXPIRED';
  return otherwise;
}

async function findOrCreateEmailUser(db: PrismaClient, email: string, campaign?: Campaign): Promise<{ userId: string; isNew: boolean }> {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // An account the Telegram bot muted comes back when its owner signs in again
    await restoreMutedAccount(db, existing.id);
    // First proof of the mailbox for an address typed at password sign-up (SEC-1). Whoever typed it never
    // proved it, so the password set then stops working in the same write that marks the address proven, and
    // every session issued before it ends (session.service.ts); the mailbox owner signs in by code from now on.
    // Accounts proven earlier are not touched: the timestamp is written once.
    if (!existing.emailVerifiedAt) {
      await markEmailProvenFirstTime(db, existing.id, { passwordHash: null });
    }
    return { userId: existing.id, isNew: false };
  }
  try {
    const user = await createUserWithReferralSlug(db, {
      email,
      emailVerifiedAt: sessionClockDate(),
      name: email.split('@')[0] || 'User',
      monthlyBudget: DEFAULT_INTENTION_AMOUNT,
      remainingBudget: DEFAULT_INTENTION_AMOUNT,
      onboardingCompleted: true,
    }, campaign);
    return { userId: user.id, isNew: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    return { userId: user.id, isNew: false };
  }
}
