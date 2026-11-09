import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@so/db';
import { ASK_MIN_DIRECT, ASK_MIN_NETWORK } from '@so/shared';
import { ASK_ERRORS } from '../config/ask.js';
import { isAdmin } from '../admin.js';
import { countConnections } from './connection-request.service.js';
import { bfsNetwork, networkReach, NETWORK_MAX_DEPTH } from './network.service.js';

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
  /** The visible rings only (1–3): people and the sum they can give; null in quick mode */
  networkVisible: number | null;
  networkCanHelpVisible: number | null;
  /** People beyond the visible rings, rounded */
  networkFar: number | null;
}

/** Authors, developers and admins are not subject to the thresholds. */
export async function isSpecialAsker(db: Db, userId: string): Promise<boolean> {
  if (isAdmin(userId)) return true;
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === 'AUTHOR' || u?.role === 'DEVELOPER';
}

/**
 * Full numbers for the UI: the same reach and sum as the home screen (networkReach), so every screen
 * agrees. With `quick`, the walk stops as soon as the network threshold is reached (enough for the
 * allow decision; networkCount is then capped and networkCanHelp is null).
 */
export async function getAskAccess(db: Db, userId: string, opts: { quick?: boolean } = {}): Promise<AskAccess> {
  if (opts.quick) {
    const [directCount, members] = await Promise.all([
      countConnections(db, userId),
      bfsNetwork(db, userId, ASK_MIN_NETWORK, NETWORK_MAX_DEPTH),
    ]);
    return {
      allowed: directCount >= ASK_MIN_DIRECT && members.length >= ASK_MIN_NETWORK,
      directCount,
      networkCount: members.length,
      needDirect: ASK_MIN_DIRECT,
      needNetwork: ASK_MIN_NETWORK,
      networkCanHelp: null,
      networkVisible: null,
      networkCanHelpVisible: null,
      networkFar: null,
    };
  }

  const [directCount, reach] = await Promise.all([countConnections(db, userId), networkReach(db, userId)]);
  return {
    // The threshold uses the exact count; the screens get the rounded one
    allowed: directCount >= ASK_MIN_DIRECT && reach.exact >= ASK_MIN_NETWORK,
    directCount,
    networkCount: reach.shown,
    needDirect: ASK_MIN_DIRECT,
    needNetwork: ASK_MIN_NETWORK,
    networkCanHelp: reach.canHelp,
    networkVisible: reach.visible,
    networkCanHelpVisible: reach.canHelpVisible,
    networkFar: reach.farShown,
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
