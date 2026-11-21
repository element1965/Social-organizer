import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { getDb } from '@so/db';
import type { PrismaClient } from '@so/db';
import { accessFromAuthHeader } from './services/auth.service.js';
import { clientIp } from './services/rate-limit.service.js';

export interface Context {
  db: PrismaClient;
  userId: string | null;
  ip: string;
  /** When the access token was issued (ms); the protected middleware ends sessions from before the first mailbox proof. */
  tokenIssuedMs?: number | null;
  /**
   * Sign-in calls made so far in this HTTP request (one context serves every call of a tRPC batch).
   * Absent for server-side callers, which are not limited per request.
   */
  authCalls?: { count: number };
}

export function createContext({ req }: CreateFastifyContextOptions): Context {
  // Only a token with a valid signature and not expired gives a userId (SO-14).
  const access = accessFromAuthHeader(req.headers.authorization);
  return {
    db: getDb(),
    userId: access?.userId ?? null,
    tokenIssuedMs: access?.issuedMs ?? null,
    ip: clientIp(req.raw),
    authCalls: { count: 0 },
  };
}
