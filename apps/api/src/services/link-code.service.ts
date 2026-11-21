import type { PrismaClient } from '@so/db';
import { hit, refund, HOUR } from './rate-limit.service.js';

/**
 * Max WRONG link-code attempts per caller (IP / platform account) per hour. Codes are 6 digits.
 * Only misses count, so people entering a valid code are never blocked, even behind a shared IP.
 */
const FAILURES_PER_HOUR = 10;

export class LinkCodeRateLimitError extends Error {
  constructor() {
    super('Too many code attempts, try again later');
  }
}

/**
 * Spends a live 6-digit linking code and returns whose it was, or null for a wrong or expired code.
 * Wrong codes count against each caller key, so the code space can't be brute-forced; issue and use are
 * logged for audit.
 *
 * Every attempt reserves a slot in each caller bucket before the database is asked, so concurrent guesses
 * cannot all pass the check while the first lookups are still in flight. A code that turns out valid
 * gives its slot back: only misses stay counted.
 *
 * The code is deleted in the same statement that finds it (SEC-4), before the caller writes anything:
 * of two redemptions running at once exactly one gets the code, the other gets null and must not write.
 */
export async function claimLinkingCode(
  db: PrismaClient,
  code: string,
  callerKeys: string[],
): Promise<{ id: string; userId: string } | null> {
  const keys = callerKeys.map((k) => `link-code:${k}`);
  const reserved: string[] = [];
  let limited = false;
  for (const k of keys) {
    reserved.push(k);
    if (!hit(k, FAILURES_PER_HOUR, HOUR)) limited = true;
  }
  if (limited) {
    // A refused attempt does not consume the quota further
    for (const k of reserved) refund(k);
    console.warn(`[link-code] rate limited: ${callerKeys.join(', ')}`);
    throw new LinkCodeRateLimitError();
  }
  let claimed: { id: string; userId: string } | undefined;
  try {
    // FOR UPDATE: a second redemption of the same code waits for the first, then finds it gone.
    // Columns are timestamp(3) in UTC, hence now() AT TIME ZONE 'UTC'.
    const rows = await db.$queryRaw<Array<{ id: string; userId: string }>>`
      DELETE FROM linking_codes WHERE id = (
        SELECT id FROM linking_codes
        WHERE code = ${code} AND "expiresAt" > (now() AT TIME ZONE 'UTC')
        ORDER BY "createdAt" DESC
        LIMIT 1
        FOR UPDATE)
      RETURNING id, "userId"`;
    claimed = rows[0];
  } catch (err) {
    for (const k of reserved) refund(k);
    throw err;
  }
  if (claimed) {
    for (const k of reserved) refund(k);
    console.log(`[link-code] used code of user ${claimed.userId} by ${callerKeys.join(', ')}`);
    return claimed;
  }
  console.log(`[link-code] wrong, expired or already used code from ${callerKeys.join(', ')}`);
  return null;
}
