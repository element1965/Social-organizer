import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { getDb } from '@so/db';
import type { PrismaClient } from '@so/db';

export interface Context {
  db: PrismaClient;
  userId: string | null;
}

export function createContext({ req }: CreateFastifyContextOptions): Context {
  const db = getDb();

  // Extract userId from JWT if present
  let userId: string | null = null;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      // Decode will be handled by auth middleware in protected procedures
      const token = auth.slice(7);
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1]!, 'base64').toString(),
      );
      userId = payload.sub ?? null;
    } catch {
      // Invalid token — userId stays null
    }
  }

  return { db, userId };
}
