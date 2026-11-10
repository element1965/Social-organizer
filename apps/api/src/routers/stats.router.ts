import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { ADMIN_IDS, CLUSTER_ROOT_OVERRIDE } from '../admin.js';
import { networkReach } from '../services/network.service.js';

class UnionFindStats {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)!));
    return this.parent.get(x)!;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/** Cache for the public site numbers: every guest hits the landing page, the count changes slowly. */
const PUBLIC_TTL_MS = 10 * 60 * 1000;
let publicCache: { users: number; at: number } | null = null;

export const statsRouter = router({
  // Public numbers for the site hero ("1 240 people in one network"). Aggregate only, no personal data.
  public: publicProcedure.query(async ({ ctx }) => {
    if (publicCache && Date.now() - publicCache.at < PUBLIC_TTL_MS) return { users: publicCache.users };
    const users = await ctx.db.user.count({ where: { deletedAt: null } });
    publicCache = { users, at: Date.now() };
    return { users };
  }),

  byPeriod: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const since = new Date(Date.now() - input.days * 86400000);

      // Find the connected cluster, then count people whose first connection
      // in the cluster was created within the period (= new people in network).
      // Also sum their remainingBudget (= new budget added to network).
      const result = await ctx.db.$queryRaw<Array<{ new_people: number; new_budget: number }>>`
        WITH RECURSIVE cluster AS (
          SELECT ${userId}::text AS user_id
          UNION
          SELECT CASE WHEN c."userAId" = cluster.user_id THEN c."userBId" ELSE c."userAId" END
          FROM connections c
          JOIN cluster ON c."userAId" = cluster.user_id OR c."userBId" = cluster.user_id
        ),
        user_first_conn AS (
          SELECT
            cluster.user_id,
            MIN(c."createdAt") AS first_connected
          FROM cluster
          JOIN connections c ON c."userAId" = cluster.user_id OR c."userBId" = cluster.user_id
          GROUP BY cluster.user_id
        )
        SELECT
          COUNT(*) FILTER (WHERE ufc.first_connected >= ${since})::int AS new_people,
          COALESCE(SUM(u."remainingBudget") FILTER (WHERE ufc.first_connected >= ${since}), 0)::float AS new_budget
        FROM user_first_conn ufc
        JOIN users u ON u.id = ufc.user_id
        WHERE u."deletedAt" IS NULL
      `;

      return {
        newPeople: result[0]?.new_people || 0,
        newBudget: Math.round(result[0]?.new_budget || 0),
      };
    }),

  profile: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const targetUserId = input?.userId ?? ctx.userId;

      const [
        connectionsCount, collectionsCreated, collectionsActive,
        obligationsGiven, obligationsReceived,
        collectionsWithHelp, helpedCollections,
      ] = await Promise.all([
        ctx.db.connection.count({
          where: { OR: [{ userAId: targetUserId }, { userBId: targetUserId }] },
        }),
        ctx.db.collection.count({ where: { creatorId: targetUserId } }),
        ctx.db.collection.count({ where: { creatorId: targetUserId, status: 'ACTIVE' } }),
        ctx.db.obligation.count({ where: { userId: targetUserId } }),
        ctx.db.obligation.count({ where: { collection: { creatorId: targetUserId } } }),
        // His collections that received at least one obligation
        ctx.db.collection.count({
          where: { creatorId: targetUserId, obligations: { some: {} } },
        }),
        // Distinct collections where he gave obligations
        ctx.db.obligation.findMany({
          where: { userId: targetUserId },
          distinct: ['collectionId'],
          select: { collectionId: true },
        }),
      ]);

      return {
        connectionsCount,
        collectionsCreated,
        collectionsActive,
        obligationsGiven,
        obligationsReceived,
        collectionsWithHelp,
        collectionsHelped: helpedCollections.length,
      };
    }),

  // Help statistics for dashboard
  help: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    // Get obligations given (user helped others)
    const obligationsGiven = await ctx.db.obligation.findMany({
      where: { userId },
      select: { amount: true },
    });

    // Get obligations received (others helped user's collections)
    const collectionsWithObligations = await ctx.db.collection.findMany({
      where: { creatorId: userId },
      include: {
        obligations: {
          select: { amount: true },
        },
      },
    });

    const givenCount = obligationsGiven.length;
    const givenTotal = obligationsGiven.reduce((sum, o) => sum + o.amount, 0);

    const receivedCount = collectionsWithObligations.reduce(
      (sum, c) => sum + c.obligations.length,
      0
    );
    const receivedTotal = collectionsWithObligations.reduce(
      (sum, c) => sum + c.obligations.reduce((s, o) => s + o.amount, 0),
      0
    );

    // Active intentions count (obligations in active collections)
    const activeIntentions = await ctx.db.obligation.count({
      where: {
        userId,
        collection: { status: 'ACTIVE' },
      },
    });

    // Completed collections count
    const completedCollections = await ctx.db.collection.count({
      where: {
        creatorId: userId,
        status: 'CLOSED',
      },
    });

    // Network reach (from connections)
    const networkReach = await ctx.db.connection.count({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
    });

    return {
      given: {
        count: givenCount,
        totalAmount: Math.round(givenTotal),
      },
      received: {
        count: receivedCount,
        totalAmount: Math.round(receivedTotal),
      },
      activeIntentions,
      completedCollections,
      networkReach,
    };
  }),

  // Help given statistics: allTime + per-month breakdown
  helpGivenByPeriod: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    const allObligations = await ctx.db.obligation.findMany({
      where: { userId },
      select: { amount: true, createdAt: true },
    });

    const allTime = {
      count: allObligations.length,
      amount: Math.round(allObligations.reduce((sum, o) => sum + o.amount, 0)),
    };

    // Group by month (YYYY-MM)
    const byMonth: Record<string, { count: number; amount: number }> = {};
    for (const o of allObligations) {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { count: 0, amount: 0 };
      byMonth[key].count++;
      byMonth[key].amount += o.amount;
    }

    // Sort months chronologically and round amounts
    const months = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, count: data.count, amount: Math.round(data.amount) }));

    return { allTime, months };
  }),

  // Platform-wide new user growth with adaptive grouping:
  // ≤14 days → daily, ≤14 weeks → weekly, otherwise → monthly
  // Returns delta (new users per period), not cumulative
  platformGrowth: protectedProcedure.query(async ({ ctx }) => {
    const firstUser = await ctx.db.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const since = firstUser?.createdAt ?? new Date();
    const now = new Date();
    const totalDays = Math.max(1, Math.ceil((now.getTime() - since.getTime()) / (24 * 60 * 60 * 1000)));

    const period: 'day' | 'week' | 'month' =
      totalDays <= 14 ? 'day' : totalDays <= 98 ? 'week' : 'month';

    const rows = await ctx.db.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM users
      WHERE "deletedAt" IS NULL
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY day
    `;

    // Daily new users map
    const countByDay = new Map(rows.map(r => [
      new Date(r.day).toISOString().slice(0, 10),
      Number(r.count),
    ]));

    if (period === 'day') {
      const points: Array<{ date: string; count: number }> = [];
      for (let i = 0; i <= totalDays; i++) {
        const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        points.push({ date: key, count: countByDay.get(key) ?? 0 });
      }
      return { period, points };
    }

    // Group by week or month — sum new users per bucket
    const bucketKey = (dateStr: string): string => {
      const d = new Date(dateStr);
      if (period === 'week') {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.getFullYear(), d.getMonth(), diff);
        return monday.toISOString().slice(0, 10);
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const buckets = new Map<string, number>();
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const key = bucketKey(dateStr);
      buckets.set(key, (buckets.get(key) ?? 0) + (countByDay.get(dateStr) ?? 0));
    }

    const points = Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
    return { period, points };
  }),

  // Help history: who this user helped & who helped this user
  /**
   * Two recorded facts about a person, shown side by side on their profile: how many times they reported
   * Participation and how many of those the authors marked as received. Closed Needs only, withdrawn
   * Participation is not counted. Counts, not a score: nothing is derived from them.
   */
  participationFacts: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = input?.userId ?? ctx.userId;
      const where = { userId, unsubscribedAt: null, collection: { status: 'CLOSED' as const } };
      const [reported, marked] = await Promise.all([
        ctx.db.obligation.count({ where }),
        // A regular collection moves its marks into per-cycle receipts at every cycle close,
        // so a pledge marked in any past cycle still counts once.
        ctx.db.obligation.count({ where: { ...where, OR: [{ confirmedAt: { not: null } }, { receipts: { some: {} } }] } }),
      ]);
      return { reported, marked };
    }),

  helpHistory: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId;

      // "Helped" = obligations where userId = target → collection.creator is who they helped
      const helpedObligations = await ctx.db.obligation.findMany({
        where: { userId: targetUserId },
        select: {
          id: true,
          amount: true,
          createdAt: true,
          collection: {
            select: {
              creator: {
                select: { id: true, name: true, photoUrl: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // "Helped by" = obligations in collections where creatorId = target → obligation.user is who helped them
      const helpedByObligations = await ctx.db.obligation.findMany({
        where: { collection: { creatorId: targetUserId } },
        select: {
          id: true,
          amount: true,
          createdAt: true,
          user: {
            select: { id: true, name: true, photoUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const helped = helpedObligations.map((o) => ({
        id: o.id,
        userId: o.collection.creator.id,
        name: o.collection.creator.name,
        photoUrl: o.collection.creator.photoUrl,
        amount: o.amount,
        createdAt: o.createdAt,
      }));

      const helpedBy = helpedByObligations.map((o) => ({
        id: o.id,
        userId: o.user.id,
        name: o.user.name,
        photoUrl: o.user.photoUrl,
        amount: o.amount,
        createdAt: o.createdAt,
      }));

      return { helped, helpedBy };
    }),

  // Admin-only: detailed stats for all users across all clusters
  adminAllUsersStats: protectedProcedure.query(async ({ ctx }) => {
    if (!ADMIN_IDS.includes(ctx.userId!)) throw new TRPCError({ code: 'FORBIDDEN' });

    const [users, allConnections] = await Promise.all([
      ctx.db.user.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, photoUrl: true, createdAt: true, lastSeen: true, remainingBudget: true },
      }),
      ctx.db.connection.findMany({ select: { userAId: true, userBId: true } }),
    ]);

    // Count direct connections per user (= personally invited/connected)
    const connMap = new Map<string, number>();
    for (const c of allConnections) {
      connMap.set(c.userAId, (connMap.get(c.userAId) ?? 0) + 1);
      connMap.set(c.userBId, (connMap.get(c.userBId) ?? 0) + 1);
    }

    // Build clusters via Union-Find
    const uf = new UnionFindStats();
    for (const c of allConnections) uf.union(c.userAId, c.userBId);

    const { member: NIKITA_ID, root: ANDREI_ID } = CLUSTER_ROOT_OVERRIDE;

    // Map each user to their UF root and group cluster members
    const userToUfRoot = new Map<string, string>();
    const clusterGroups = new Map<string, string[]>(); // ufRoot → member IDs
    for (const u of users) {
      const ufRoot = uf.parent.has(u.id) ? uf.find(u.id) : u.id;
      userToUfRoot.set(u.id, ufRoot);
      if (!clusterGroups.has(ufRoot)) clusterGroups.set(ufRoot, []);
      clusterGroups.get(ufRoot)!.push(u.id);
    }

    // Determine display root for each cluster (oldest member; Andrei for Nikita's cluster)
    const userById = new Map(users.map(u => [u.id, u]));
    const clusterDisplay = new Map<string, { id: string; name: string }>(); // ufRoot → display

    for (const [ufRoot, memberIds] of clusterGroups) {
      const hasNikita = memberIds.includes(NIKITA_ID);
      let best: typeof users[0] | undefined;
      for (const uid of memberIds) {
        const u = userById.get(uid);
        if (!u) continue;
        if (hasNikita && u.id === ANDREI_ID) { best = u; break; }
        if (!hasNikita && (!best || u.createdAt < best.createdAt)) best = u;
      }
      // Fallback: if Andrei not in Nikita's cluster, use oldest
      if (hasNikita && (!best || best.id !== ANDREI_ID)) {
        best = memberIds
          .map(id => userById.get(id))
          .filter((u): u is typeof users[0] => !!u)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      }
      clusterDisplay.set(ufRoot, { id: best?.id ?? ufRoot, name: best?.name ?? 'Unknown' });
    }

    const result = users.map(u => {
      const ufRoot = userToUfRoot.get(u.id) ?? u.id;
      const display = clusterDisplay.get(ufRoot) ?? { id: u.id, name: u.name };
      return {
        id: u.id,
        name: u.name,
        photoUrl: u.photoUrl,
        createdAt: u.createdAt,
        lastSeen: u.lastSeen,
        remainingBudget: Math.round(u.remainingBudget ?? 0),
        connectionCount: connMap.get(u.id) ?? 0,
        inviteCount: connMap.get(u.id) ?? 0,
        clusterRootId: display.id,
        clusterRootName: display.name,
      };
    });

    result.sort((a, b) => b.inviteCount - a.inviteCount || b.connectionCount - a.connectionCount);
    return result;
  }),

  // Current network capabilities: what the people a request reaches can still give this period
  networkCapabilities: protectedProcedure.query(async ({ ctx }) => {
    // If user has no connections, fallback to inviter's network (pending connection)
    let userId = ctx.userId;
    const hasConn = await ctx.db.connection.findFirst({
      where: { OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }] },
      select: { id: true },
    });
    if (!hasConn) {
      const pending = await ctx.db.pendingConnection.findFirst({
        where: { fromUserId: ctx.userId, status: 'PENDING' },
        select: { toUserId: true },
        orderBy: { createdAt: 'desc' },
      });
      if (pending) userId = pending.toUserId;
    }

    // The same reach and the same sum as the profile and the ask screen (networkReach):
    // everyone a request travels to, up to the 6th handshake, without the person themselves
    const reach = await networkReach(ctx.db, userId);
    // total/people: everyone a request can reach (a ceiling); visible*: the rings 1–3, which the person can see
    return {
      total: reach.canHelp,
      people: reach.shown,
      visibleTotal: reach.canHelpVisible,
      visiblePeople: reach.visible,
      farPeople: reach.farShown,
    };
  }),
});
