import type { PrismaClient } from '@so/db';
import { hit, isLimited, HOUR } from './rate-limit.service.js';

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
 * Looks up a live 6-digit linking code. Wrong codes count against each caller key,
 * so the code space can't be brute-forced; issue and use are logged for audit.
 */
export async function findLinkingCode(db: PrismaClient, code: string, callerKeys: string[]) {
  const keys = callerKeys.map((k) => `link-code:${k}`);
  if (keys.some((k) => isLimited(k, FAILURES_PER_HOUR))) {
    console.warn(`[link-code] rate limited: ${callerKeys.join(', ')}`);
    throw new LinkCodeRateLimitError();
  }
  const linkingCode = await db.linkingCode.findFirst({
    where: { code, expiresAt: { gt: new Date() } },
  });
  if (linkingCode) {
    console.log(`[link-code] used code of user ${linkingCode.userId} by ${callerKeys.join(', ')}`);
  } else {
    for (const k of keys) hit(k, FAILURES_PER_HOUR, HOUR);
    console.log(`[link-code] wrong or expired code from ${callerKeys.join(', ')}`);
  }
  return linkingCode;
}
