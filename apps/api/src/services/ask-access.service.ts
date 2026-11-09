import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@so/db';
import { MIN_COLLECTION_AMOUNT, ASK_MIN_DIRECT, ASK_MIN_NETWORK } from '@so/shared';
import { ASK_ERRORS, ASK_FIRST_AMOUNT_FACTOR, ASK_NETWORK_SCAN_LIMIT } from '../config/ask.js';
import { isAdmin } from '../admin.js';
import { countConnections } from './connection-request.service.js';
import { bfsNetwork } from './network.service.js';

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

/** Authors, developers and admins are not subject to the thresholds. */
export async function isSpecialAsker(db: Db, userId: string): Promise<boolean> {
  if (isAdmin(userId)) return true;
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === 'AUTHOR' || u?.role === 'DEVELOPER';
}

/** What the network can help with: the same figure the dashboard shows (sum of members' remaining budgets). */
async function networkCanHelp(db: Db, members: Array<{ user_id: string }>): Promise<number> {
  const users = await db.user.findMany({
    where: { id: { in: members.map((m) => m.user_id) } },
    select: { remainingBudget: true },
  });
  return users.reduce((s, u) => s + (u.remainingBudget ?? 0), 0);
}

function capFor(canHelp: number): number {
  return Math.max(MIN_COLLECTION_AMOUNT, Math.floor(canHelp * ASK_FIRST_AMOUNT_FACTOR));
}

/**
 * Full numbers for the UI. With `quick`, the walk stops as soon as the network threshold is reached
 * (enough for the allow decision; networkCount is then capped and maxFirstAmount is null).
 */
export async function getAskAccess(db: Db, userId: string, opts: { quick?: boolean } = {}): Promise<AskAccess> {
  const [directCount, members, previousAsks] = await Promise.all([
    countConnections(db, userId),
    bfsNetwork(db, userId, opts.quick ? ASK_MIN_NETWORK : ASK_NETWORK_SCAN_LIMIT),
    db.collection.count({ where: { creatorId: userId } }),
  ]);
  const isFirstAsk = previousAsks === 0;
  const maxFirstAmount = !opts.quick && isFirstAsk ? capFor(await networkCanHelp(db, members)) : null;

  return {
    allowed: directCount >= ASK_MIN_DIRECT && members.length >= ASK_MIN_NETWORK,
    directCount,
    networkCount: members.length,
    needDirect: ASK_MIN_DIRECT,
    needNetwork: ASK_MIN_NETWORK,
    maxFirstAmount,
    isFirstAsk,
  };
}

export function assertAskAllowed(access: Pick<AskAccess, 'allowed'>): void {
  if (!access.allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `${ASK_ERRORS.locked}: Need at least ${ASK_MIN_DIRECT} direct connections and ${ASK_MIN_NETWORK} people in your network`,
    });
  }
}

/**
 * The user's first ever collection is capped at 2x what the network can help with.
 * `excludeCollectionId` is the collection being edited, so editing the only collection still counts as "first".
 */
export async function assertFirstAskCap(db: Db, userId: string, amount: number, excludeCollectionId?: string): Promise<void> {
  const others = await db.collection.count({
    where: { creatorId: userId, ...(excludeCollectionId ? { id: { not: excludeCollectionId } } : {}) },
  });
  if (others > 0) return;
  const members = await bfsNetwork(db, userId, ASK_NETWORK_SCAN_LIMIT);
  const cap = capFor(await networkCanHelp(db, members));
  if (amount > cap) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${ASK_ERRORS.amountCap}: Your first request can be at most $${cap}`,
    });
  }
}
