import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@so/db';
import { ASK_MIN_DIRECT, ASK_MIN_NETWORK } from '@so/shared';
import { ASK_ERRORS, ASK_NETWORK_SCAN_LIMIT } from '../config/ask.js';
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
  /**
   * What the network can help with now (sum of members' remaining budgets); null in quick mode.
   * Soft guidance only: the UI warns when a request exceeds it, the server never blocks on it.
   */
  networkCanHelp: number | null;
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

/**
 * Full numbers for the UI. With `quick`, the walk stops as soon as the network threshold is reached
 * (enough for the allow decision; networkCount is then capped and networkCanHelp is null).
 */
export async function getAskAccess(db: Db, userId: string, opts: { quick?: boolean } = {}): Promise<AskAccess> {
  const [directCount, members] = await Promise.all([
    countConnections(db, userId),
    bfsNetwork(db, userId, opts.quick ? ASK_MIN_NETWORK : ASK_NETWORK_SCAN_LIMIT),
  ]);
  const canHelp = opts.quick ? null : await networkCanHelp(db, members);

  return {
    allowed: directCount >= ASK_MIN_DIRECT && members.length >= ASK_MIN_NETWORK,
    directCount,
    networkCount: members.length,
    needDirect: ASK_MIN_DIRECT,
    needNetwork: ASK_MIN_NETWORK,
    networkCanHelp: canHelp,
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
