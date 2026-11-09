import type { PrismaClient } from '@so/db';
import { MIN_COLLECTION_AMOUNT } from '@so/shared';
import {
  ASK_FIRST_AMOUNT_FACTOR,
  ASK_MIN_DIRECT,
  ASK_MIN_NETWORK,
  ASK_NETWORK_SCAN_LIMIT,
} from '../config/ask.js';
import { countConnections } from './connection-request.service.js';

type Db = PrismaClient;

export interface AskAccess {
  allowed: boolean;
  directCount: number;
  networkCount: number;
  needDirect: number;
  needNetwork: number;
  /** Cap for the user's first ever request; null once they already had one. */
  maxFirstAmount: number | null;
  isFirstAsk: boolean;
}

/** BFS over confirmed connections, level by level (no full-table load). Returns the people in the network, self excluded. */
async function networkMembers(db: Db, userId: string): Promise<string[]> {
  const visited = new Set<string>([userId]);
  let frontier = [userId];
  while (frontier.length > 0 && visited.size - 1 < ASK_NETWORK_SCAN_LIMIT) {
    const rows = await db.connection.findMany({
      where: { OR: [{ userAId: { in: frontier } }, { userBId: { in: frontier } }] },
      select: { userAId: true, userBId: true },
    });
    const next: string[] = [];
    for (const r of rows) {
      for (const id of [r.userAId, r.userBId]) {
        if (!visited.has(id)) {
          visited.add(id);
          next.push(id);
        }
      }
    }
    frontier = next;
  }
  visited.delete(userId);
  return [...visited];
}

export async function getAskAccess(db: Db, userId: string): Promise<AskAccess> {
  const [directCount, members, previousAsks] = await Promise.all([
    countConnections(db, userId),
    networkMembers(db, userId),
    db.collection.count({ where: { creatorId: userId } }),
  ]);

  const live = await db.user.findMany({
    where: { id: { in: members }, deletedAt: null },
    select: { remainingBudget: true },
  });
  const networkCount = live.length;
  // "Network can help" = sum of the budgets people in the network have left (same figure the dashboard shows).
  const canHelp = live.reduce((s, u) => s + (u.remainingBudget ?? 0), 0);
  const isFirstAsk = previousAsks === 0;

  return {
    allowed: directCount >= ASK_MIN_DIRECT && networkCount >= ASK_MIN_NETWORK,
    directCount,
    networkCount,
    needDirect: ASK_MIN_DIRECT,
    needNetwork: ASK_MIN_NETWORK,
    maxFirstAmount: isFirstAsk ? Math.max(MIN_COLLECTION_AMOUNT, Math.floor(canHelp * ASK_FIRST_AMOUNT_FACTOR)) : null,
    isFirstAsk,
  };
}
