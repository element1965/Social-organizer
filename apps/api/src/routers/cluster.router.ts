import { TRPCError } from '@trpc/server';
import { isAdmin } from '../admin.js';
import { router, protectedProcedure } from '../trpc.js';
import { findClusters } from '../services/cluster.service.js';
import { remainingBudgets } from '../services/network.service.js';

/** Rows sent to the admin screen: the largest clusters, then a few people who have no connections yet. */
const CLUSTER_LIMIT = 200;
const ISOLATED_LIMIT = 50;
/** The newest accounts looked through to find them: people without connections are almost always recent. */
const ISOLATED_SCAN = 2_000;

/**
 * Clusters are whole connected components: names and intentions of people far beyond the caller's
 * visible rings. Admin statistics only.
 */
function assertAdmin(userId: string | null | undefined) {
  if (!userId || !isAdmin(userId)) throw new TRPCError({ code: 'FORBIDDEN' });
}

export const clusterRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.userId);
    const [clusters, budgets] = await Promise.all([findClusters(ctx.db), remainingBudgets(ctx.db)]);
    const top = clusters.list.slice(0, CLUSTER_LIMIT);

    // People without a single connection: each is a cluster of one. Only the newest are listed, and they
    // are picked out by the graph in memory (an anti-join over connections took 3 s on 100,000 people).
    const [roots, newest] = await Promise.all([
      ctx.db.user.findMany({ where: { id: { in: top.map((c) => c.rootUserId) } }, select: { id: true, name: true } }),
      ctx.db.user.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, remainingBudget: true },
        orderBy: { createdAt: 'desc' },
        take: ISOLATED_SCAN,
      }),
    ]);
    const isolated = newest.filter((u) => clusters.degree(u.id) === 0).slice(0, ISOLATED_LIMIT);
    const nameOf = new Map(roots.map((u) => [u.id, u.name]));
    const mine = clusters.rootOf.get(ctx.userId);

    const result = top.map((cluster) => {
      let totalBudget = 0;
      for (const id of cluster.members) totalBudget += budgets.get(id) ?? 0;
      return {
        rootUserId: cluster.rootUserId,
        rootUserName: nameOf.get(cluster.rootUserId) ?? 'Unknown',
        memberCount: cluster.members.length,
        totalBudget: Math.round(totalBudget),
        isMine: mine === cluster.rootUserId,
      };
    });
    for (const u of isolated) {
      result.push({
        rootUserId: u.id,
        rootUserName: u.name,
        memberCount: 1,
        totalBudget: Math.round(u.remainingBudget ?? 0),
        isMine: u.id === ctx.userId,
      });
    }
    return result;
  }),
});
