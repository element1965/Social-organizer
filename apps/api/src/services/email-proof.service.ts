import type { PrismaClient } from '@so/db';
import { sessionClockDate } from './session-clock.js';

// The first mailbox proof, kept apart from token code so the identity services need no signing secret to load.
// How it ends earlier sessions: session.service.ts.

/**
 * Marks the address of an existing account proven for the first time and applies `data` in the same write
 * (the e-mail code flow also ends a password nobody proved). Returns false when the address was already
 * proven, in which case nothing is changed: later proofs never move the timestamp.
 */
export async function markEmailProvenFirstTime(
  db: PrismaClient,
  userId: string,
  data: { passwordHash?: null } = {},
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ emailVerifiedAt: Date | null }>>`
      SELECT "emailVerifiedAt" FROM users WHERE id = ${userId} FOR UPDATE`;
    if (!rows[0] || rows[0].emailVerifiedAt) return false;
    // The session clock, read while the row is held: every token issued under an earlier lock is not later than
    // this, and every token issued afterwards in this process (the proving request's own pair) is not earlier
    await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: sessionClockDate(), ...data } });
    return true;
  });
}
