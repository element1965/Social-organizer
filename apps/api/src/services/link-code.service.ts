import type { PrismaClient } from '@so/db';
import { hit, HOUR } from './rate-limit.service.js';

/** Max link-code attempts per caller (IP / platform account) per hour. Codes are 6 digits. */
const ATTEMPTS_PER_HOUR = 10;

export class LinkCodeRateLimitError extends Error {
  constructor() {
    super('Too many code attempts, try again later');
  }
}

/**
 * Looks up a live 6-digit linking code. Every lookup counts against each caller key,
 * so the code space can't be brute-forced; issue and use are logged for audit.
 */
export async function findLinkingCode(db: PrismaClient, code: string, callerKeys: string[]) {
  for (const key of callerKeys) {
    if (!hit(`link-code:${key}`, ATTEMPTS_PER_HOUR, HOUR)) {
      console.warn(`[link-code] rate limited: ${callerKeys.join(', ')}`);
      throw new LinkCodeRateLimitError();
    }
  }
  const linkingCode = await db.linkingCode.findFirst({
    where: { code, expiresAt: { gt: new Date() } },
  });
  console.log(
    linkingCode
      ? `[link-code] used code of user ${linkingCode.userId} by ${callerKeys.join(', ')}`
      : `[link-code] wrong or expired code from ${callerKeys.join(', ')}`,
  );
  return linkingCode;
}
