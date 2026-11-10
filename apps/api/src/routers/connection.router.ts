import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { GRAPH_SLICE_DEPTH } from '@so/shared';
import { getGraphSlice, findPathBetweenUsers } from '../services/bfs.service.js';
import { canViewContacts } from '../services/visibility.service.js';
import { isAdmin } from '../admin.js';
import { countConnections } from '../services/connection-request.service.js';
import { bfsNetwork, networkReach, roundFarCount, VISIBLE_RINGS, type FarCount } from '../services/network.service.js';
import { invalidateGraph } from '../services/graph-cache.service.js';

/** Rings shown only as a rounded count; `beyond` in the answer is the rest of the reach (6th). */
const FAR_RINGS = [4, 5] as const;
/** Cap on people sent with details; BFS order, so the nearer rings are always complete first. */
const NETWORK_DETAIL_LIMIT = 1000;

export const connectionRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const connections = await ctx.db.connection.findMany({
      where: { OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }] },
      include: {
        userA: { select: { id: true, name: true, photoUrl: true, remainingBudget: true } },
        userB: { select: { id: true, name: true, photoUrl: true, remainingBudget: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get all other user IDs
    const otherUserIds = connections.map((c) =>
      c.userAId === ctx.userId ? c.userBId : c.userAId
    );

    // Count connections for each user
    const connectionCounts = await ctx.db.$queryRaw<Array<{ user_id: string; count: bigint }>>`
      SELECT u.id as user_id, COUNT(c.id)::bigint as count
      FROM users u
      LEFT JOIN connections c ON (c."userAId" = u.id OR c."userBId" = u.id)
      WHERE u.id = ANY(${otherUserIds})
      GROUP BY u.id
    `;
    const countMap = new Map(connectionCounts.map((c) => [c.user_id, Number(c.count)]));

    return connections.map((c) => {
      const isA = c.userAId === ctx.userId;
      const other = isA ? c.userB : c.userA;
      const nickname = isA ? c.nicknameByA : c.nicknameByB;
      return {
        id: c.id, userId: other.id, name: other.name,
        photoUrl: other.photoUrl, createdAt: c.createdAt,
        connectionCount: countMap.get(other.id) || 0,
        remainingBudget: other.remainingBudget,
        nickname: nickname || null,
        displayName: nickname || other.name,
      };
    });
  }),

  listForUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Admins see anyone's connections (admin block on the person page)
      const canView = isAdmin(ctx.userId) || (await canViewContacts(ctx.db, ctx.userId, input.userId));
      if (!canView) return [];

      const connections = await ctx.db.connection.findMany({
        where: { OR: [{ userAId: input.userId }, { userBId: input.userId }] },
        include: {
          userA: { select: { id: true, name: true, photoUrl: true, remainingBudget: true } },
          userB: { select: { id: true, name: true, photoUrl: true, remainingBudget: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const otherUserIds = connections.map((c) =>
        c.userAId === input.userId ? c.userBId : c.userAId
      );

      const connectionCounts = otherUserIds.length > 0
        ? await ctx.db.$queryRaw<Array<{ user_id: string; count: bigint }>>`
            SELECT u.id as user_id, COUNT(c.id)::bigint as count
            FROM users u
            LEFT JOIN connections c ON (c."userAId" = u.id OR c."userBId" = u.id)
            WHERE u.id = ANY(${otherUserIds})
            GROUP BY u.id
          `
        : [];
      const countMap = new Map(connectionCounts.map((c) => [c.user_id, Number(c.count)]));

      return connections.map((c) => {
        const isA = c.userAId === input.userId;
        const other = isA ? c.userB : c.userA;
        return {
          userId: other.id,
          name: other.name,
          photoUrl: other.photoUrl,
          connectionCount: countMap.get(other.id) || 0,
          remainingBudget: other.remainingBudget,
        };
      });
    }),

  // No `add`: a connection is created only when the other person confirms it (pending request,
  // invite) or through an SOS link. A one-sided add would let anyone farm the SOS threshold (SO-15).

  getCount: protectedProcedure.query(async ({ ctx }) => {
    // Confirmed acquaintances — the same number the server uses for SOS and the 150 limit (SO-15)
    const count = await countConnections(ctx.db, ctx.userId);
    return { count };
  }),

  graphSlice: protectedProcedure
    .input(z.object({ depth: z.number().min(1).max(3).default(GRAPH_SLICE_DEPTH) }).optional())
    .query(async ({ ctx, input }) => {
      return getGraphSlice(ctx.db, ctx.userId, input?.depth ?? GRAPH_SLICE_DEPTH);
    }),

  findPath: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .query(async ({ ctx, input }) => {
      const path = await findPathBetweenUsers(ctx.db, ctx.userId, input.targetUserId);
      return { path };
    }),

  getNetworkStats: protectedProcedure.query(async ({ ctx }) => {
    // If user has no connections, fallback to inviter's network (pending connection)
    let bfsUserId = ctx.userId;
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
      if (pending) bfsUserId = pending.toUserId;
    }

    // Counts cover the whole reach of a request (networkReach); names and details only the visible
    // rings (1–3). Beyond them only rounded counts leave the server: who is there stays private.
    const [counts, recipients] = await Promise.all([
      networkReach(ctx.db, bfsUserId),
      bfsNetwork(ctx.db, bfsUserId, NETWORK_DETAIL_LIMIT, VISIBLE_RINGS),
    ]);

    const byDepth: Record<number, number> = {};
    for (let depth = 1; depth <= VISIBLE_RINGS; depth++) {
      if (counts.byDepth[depth]) byDepth[depth] = counts.byDepth[depth]!;
    }
    const far = {
      ...Object.fromEntries(FAR_RINGS.map((depth) => [depth, roundFarCount(counts.byDepth[depth] ?? 0)])),
      /** Everyone further than the last far ring */
      beyond: roundFarCount(
        Object.entries(counts.byDepth).reduce((sum, [depth, n]) => (Number(depth) > FAR_RINGS[FAR_RINGS.length - 1]! ? sum + n : sum), 0),
      ),
    } as Record<4 | 5, FarCount> & { beyond: FarCount };

    const userIdsByDepth: Record<number, string[]> = {};
    const connAtMap = new Map<string, Date | null>();

    for (const r of recipients) {
      if (!userIdsByDepth[r.depth]) userIdsByDepth[r.depth] = [];
      userIdsByDepth[r.depth]!.push(r.user_id);
      connAtMap.set(r.user_id, r.max_conn_at);
    }

    // Get all unique user IDs
    const allUserIds = recipients.map((r) => r.user_id);

    // Fetch user details and their connection counts in parallel
    const [users, connectionCounts] = await Promise.all([
      ctx.db.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, name: true, photoUrl: true, remainingBudget: true, createdAt: true },
      }),
      // Count connections for each user (first handshake count)
      ctx.db.$queryRaw<Array<{ user_id: string; count: bigint }>>`
        SELECT u.id as user_id, COUNT(c.id)::bigint as count
        FROM users u
        LEFT JOIN connections c ON (c."userAId" = u.id OR c."userBId" = u.id)
        WHERE u.id = ANY(${allUserIds})
        GROUP BY u.id
      `,
    ]);

    // Create maps for quick lookup
    const userMap = new Map(users.map((u) => [u.id, u]));
    const countMap = new Map(connectionCounts.map((c) => [c.user_id, Number(c.count)]));

    // Build usersByDepth with connection counts and budget
    const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
    const usersByDepth: Record<number, Array<{ id: string; name: string; photoUrl: string | null; connectionCount: number; remainingBudget: number | null; createdAt: Date | null; connectedAt: Date | null }>> = {};
    for (const [depth, userIds] of Object.entries(userIdsByDepth)) {
      usersByDepth[Number(depth)] = userIds.map((id) => {
        const user = userMap.get(id);
        return {
          id,
          name: user?.name || 'Unknown',
          photoUrl: user?.photoUrl || null,
          connectionCount: countMap.get(id) || 0,
          remainingBudget: user?.remainingBudget ?? null,
          createdAt: user?.createdAt ?? null,
          connectedAt: connAtMap.get(id) ?? null,
        };
      });
      // Sort: new connections (last 24h) first, then by createdAt DESC
      usersByDepth[Number(depth)]!.sort((a, b) => {
        const aNew = a.connectedAt && new Date(a.connectedAt).getTime() > dayAgoMs ? 1 : 0;
        const bNew = b.connectedAt && new Date(b.connectedAt).getTime() > dayAgoMs ? 1 : 0;
        if (aNew !== bNew) return bNew - aNew;
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    // Calculate growth: 24h (real-time), 7d, 28d (period), 364d (13×28)
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const yearAgo = new Date(now.getTime() - 13 * 28 * 24 * 60 * 60 * 1000);

    const [dayCount, weekCount, monthCount, yearCount] = await Promise.all([
      ctx.db.connection.count({
        where: {
          OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }],
          createdAt: { gte: dayAgo },
        },
      }),
      ctx.db.connection.count({
        where: {
          OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }],
          createdAt: { gte: weekAgo },
        },
      }),
      ctx.db.connection.count({
        where: {
          OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }],
          createdAt: { gte: monthAgo },
        },
      }),
      ctx.db.connection.count({
        where: {
          OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }],
          createdAt: { gte: yearAgo },
        },
      }),
    ]);

    return {
      // You + the network as every screen shows it (visible rings exactly, the far part rounded once)
      totalReachable: 1 + counts.shown,
      /** The same as `totalReachable` without you: the "N people" next to "can help" */
      /** People in the visible rings 1–3 (the headline) and, separately, the rounded far part */
      networkPeople: counts.visible,
      networkFar: counts.farShown,
      networkShown: counts.shown,
      networkCanHelpVisible: counts.canHelpVisible,
      networkCanHelp: counts.canHelp,
      byDepth,
      far,
      usersByDepth,
      growth: {
        day: dayCount,
        week: weekCount,
        month: monthCount,
        year: yearCount,
      },
    };
  }),

  getNickname: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [userAId, userBId] = [ctx.userId, input.targetUserId].sort();
      const conn = await ctx.db.connection.findUnique({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
      });
      if (!conn) return { nickname: null, isConnected: false };
      const nickname = ctx.userId === conn.userAId ? conn.nicknameByA : conn.nicknameByB;
      return { nickname: nickname || null, isConnected: true };
    }),

  setNickname: protectedProcedure
    .input(z.object({ targetUserId: z.string(), nickname: z.string().max(100) }))
    .mutation(async ({ ctx, input }) => {
      const [userAId, userBId] = [ctx.userId, input.targetUserId].sort();
      const field = ctx.userId === userAId ? 'nicknameByA' : 'nicknameByB';
      const value = input.nickname.trim() || null;
      await ctx.db.connection.update({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
        data: { [field]: value },
      });
      return { success: true, nickname: value };
    }),

  revoke: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [userAId, userBId] = [ctx.userId, input.targetUserId].sort();
      const conn = await ctx.db.connection.findUnique({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
      });
      if (!conn) throw new TRPCError({ code: 'NOT_FOUND', message: 'Connection not found' });

      // "Remove from circle" is final: no request comes back. The old request rows between the two go too,
      // so a later shake, QR or "We know each other" starts clean (the pair is unique per direction).
      await ctx.db.$transaction([
        ctx.db.connection.delete({
          where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
        }),
        ctx.db.pendingConnection.deleteMany({
          where: {
            OR: [
              { fromUserId: ctx.userId, toUserId: input.targetUserId },
              { fromUserId: input.targetUserId, toUserId: ctx.userId },
            ],
          },
        }),
      ]);
      invalidateGraph([userAId!, userBId!]);

      return { success: true };
    }),

  growthHistory: protectedProcedure.query(async ({ ctx }) => {
    // Get user's registration date to show full history from day 1
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      select: { createdAt: true },
    });
    const since = user?.createdAt ?? new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const totalDays = Math.max(1, Math.ceil((now.getTime() - since.getTime()) / (24 * 60 * 60 * 1000)));

    const rows = await ctx.db.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT DATE_TRUNC('day', c."createdAt") AS day, COUNT(*)::bigint AS count
      FROM connections c
      WHERE (c."userAId" = ${ctx.userId} OR c."userBId" = ${ctx.userId})
        AND c."createdAt" >= ${since}
      GROUP BY DATE_TRUNC('day', c."createdAt")
      ORDER BY day
    `;

    const countByDay = new Map(rows.map(r => [
      new Date(r.day).toISOString().slice(0, 10),
      Number(r.count),
    ]));

    // Cumulative chart from registration date to today
    const result: Array<{ date: string; count: number }> = [];
    let cumulative = 0;

    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      cumulative += countByDay.get(key) ?? 0;
      result.push({ date: key, count: cumulative });
    }

    return result;
  }),
});
