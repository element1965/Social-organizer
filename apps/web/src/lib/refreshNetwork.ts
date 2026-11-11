import type { trpc } from './trpc';

type Utils = ReturnType<typeof trpc.useUtils>;

/**
 * After a new connection (shake, QR scan, confirmed request) everything derived from the network
 * is refetched at once: the circle list and graph, network figures, counts, milestones and the
 * ask threshold. Without it the graph waited for its 5-minute poll.
 */
export function refreshNetwork(utils: Utils): Promise<unknown> {
  return Promise.all([
    utils.connection.invalidate(),
    utils.pending.invalidate(),
    utils.notification.attention.invalidate(),
    utils.milestone.invalidate(),
    utils.stats.invalidate(),
    utils.user.me.invalidate(),
    utils.collection.askAccess.invalidate(),
  ]);
}
