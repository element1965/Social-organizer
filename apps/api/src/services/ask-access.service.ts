import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@so/db';
import { ASK_MIN_DIRECT, ASK_MIN_NETWORK } from '@so/shared';
import { ASK_ERRORS } from '../config/ask.js';
import { isAdmin } from '../admin.js';
import { countConnections } from './connection-request.service.js';
import { bfsNetwork, networkReach, publicFigure, NETWORK_MAX_DEPTH } from './network.service.js';

type Db = PrismaClient;

export interface AskAccess {
  allowed: boolean;
  directCount: number;
  /** Whether each threshold is met, decided on the exact counts: the progress shows completion from these */
  directMet: boolean;
  networkMet: boolean;
  /**
   * The network figure (publicFigure, the same number `stats.networkFigure` gives the screens): people up to
   * the 6th handshake, rings 1–3 exactly and the 4th to 6th as one rounded count. The gate itself is checked
   * on the exact count, server side. In quick mode (server-internal only) the exact count, capped at `needNetwork`.
   */
  networkCount: number;
  needDirect: number;
  needNetwork: number;
  /**
   * The network figure: declared participation of the same people (sum of their remaining budgets); null in
   * quick mode. Soft guidance only: the UI warns when a request exceeds it, the server never blocks on it.
   */
  networkCanHelp: number | null;
}

/** Authors, developers and admins are not subject to the thresholds. */
export async function isSpecialAsker(db: Db, userId: string): Promise<boolean> {
  if (isAdmin(userId)) return true;
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === 'AUTHOR' || u?.role === 'DEVELOPER';
}

/**
 * Whether the person may report a Need, with the thresholds and the same network figure as every screen
 * (publicFigure over networkReach), so the Need tab cannot show other numbers. Never the network of someone
 * else: a person with no connection yet gets zeros. With `quick`, the walk stops as soon as the network threshold is
 * reached (enough for the allow decision; networkCount is then the capped exact count and the rest is null).
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
      directMet: directCount >= ASK_MIN_DIRECT,
      networkMet: members.length >= ASK_MIN_NETWORK,
      networkCount: members.length,
      needDirect: ASK_MIN_DIRECT,
      needNetwork: ASK_MIN_NETWORK,
      networkCanHelp: null,
    };
  }

  const [directCount, reach] = await Promise.all([countConnections(db, userId), networkReach(db, userId)]);
  const figure = publicFigure(reach);
  const directMet = directCount >= ASK_MIN_DIRECT;
  const networkMet = reach.exact >= ASK_MIN_NETWORK;
  return {
    // The thresholds use the exact counts (to the 6th handshake); the screens get the figure
    allowed: directMet && networkMet,
    directCount,
    directMet,
    networkMet,
    networkCount: figure.people,
    needDirect: ASK_MIN_DIRECT,
    needNetwork: ASK_MIN_NETWORK,
    networkCanHelp: figure.canHelp,
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
