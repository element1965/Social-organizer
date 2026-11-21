import type { PrismaClient } from '@so/db';
import { issuedBeforeEmailProof } from './auth.service.js';

/**
 * The same rule the protected tRPC middleware applies: the account exists, is not deleted, and the token was
 * not issued before the account's first mailbox proof (SEC-1).
 * Used by routes outside tRPC (REST admin routes, the Gun relay handshake), which only see a token.
 */
export async function isActiveAccount(db: PrismaClient, userId: string, tokenIssuedMs: number): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { deletedAt: true, emailVerifiedAt: true } });
  return !!user && !user.deletedAt && !issuedBeforeEmailProof(tokenIssuedMs, user.emailVerifiedAt);
}
