import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { getDb } from '@so/db';
import type { PrismaClient } from '@so/db';
import { userIdFromAuthHeader } from './services/auth.service.js';
import { clientIp } from './services/rate-limit.service.js';

export interface Context {
  db: PrismaClient;
  userId: string | null;
  ip: string;
}

export function createContext({ req }: CreateFastifyContextOptions): Context {
  // Only a token with a valid signature and not expired gives a userId (SO-14).
  return {
    db: getDb(),
    userId: userIdFromAuthHeader(req.headers.authorization),
    ip: clientIp(req.raw),
  };
}
