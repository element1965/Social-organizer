import type { PrismaClient } from '@so/db';
import { createAccessToken, createRefreshToken } from './auth.service.js';
import { touchUser } from './activity.service.js';

/**
 * Sessions and the first mailbox proof (SEC-1).
 *
 * Tokens are stateless, so "every session from before the first proof ends" is a rule on `emailVerifiedAt`:
 * a token issued before it is refused (refresh, protected tRPC, the Gun handshake, admin REST routes).
 * `emailVerifiedAt` is written once, at the first proof, and never moved by later sign-ins. The cutoff and every
 * token's issue time come from one clock, this process's monotonic session clock (session-clock.ts), never the
 * database's: tokens issued by the proving request, or later, are never older than the cutoff.
 *
 * The proof and every token issue that depends on the account's state (password sign-in, refresh) take the
 * same row lock, so a token cannot be issued from the state before the proof once the proof has started:
 * - the proof (email-proof.service.ts) takes FOR UPDATE and reads the clock only after it holds the row, so its timestamp is
 *   not earlier than any token issued under an earlier lock (equal only within one millisecond);
 * - an issue takes FOR SHARE and checks the state it holds; one that waited for a proof sees the proven row.
 */

type SessionRow = { deletedAt: Date | null; emailVerifiedAt: Date | null; passwordHash: string | null };

/**
 * Issues an access + refresh token pair only if the account, read under a share lock, passes `accept`.
 * Returns null otherwise. The tokens are created while the lock is held, so a first mailbox proof that
 * starts afterwards is later than them and ends them.
 */
export async function issueTokensIf(
  db: PrismaClient,
  userId: string,
  accept: (row: SessionRow) => boolean,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const tokens = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<SessionRow[]>`
      SELECT "deletedAt", "emailVerifiedAt", "passwordHash" FROM users WHERE id = ${userId} FOR SHARE`;
    const row = rows[0];
    if (!row || !accept(row)) return null;
    // Never earlier than the cutoff this account already has, whatever the wall clock did since it was written
    const notBeforeMs = row.emailVerifiedAt?.getTime();
    return { accessToken: createAccessToken(userId, notBeforeMs), refreshToken: createRefreshToken(userId, notBeforeMs) };
  });
  // Activity heartbeat after the lock is released (it writes the same row)
  if (tokens) touchUser(db, userId);
  return tokens;
}

/**
 * Token pair for a sign-in that has already decided who the person is (Telegram, Google, Apple, e-mail code,
 * link code). Read under the same share lock as issueTokensIf, so the issue time is never before the account's
 * first-proof cutoff, even when this process's clock is behind the one that wrote it (a redeploy on another host).
 */
export async function issueSignInTokens(
  db: PrismaClient,
  userId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokens = await issueTokensIf(db, userId, () => true);
  if (!tokens) throw new Error(`issueSignInTokens: account ${userId} not found`);
  return tokens;
}
