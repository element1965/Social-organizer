import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { GRAPH_SLICE_DEPTH } from '@so/shared';
import { getGraphSlice, findPathBetweenUsers } from '../services/bfs.service.js';
import { canViewContacts } from '../services/visibility.service.js';

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
      const canView = await canViewContacts(ctx.db, ctx.userId, input.userId);
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

  add: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot connect to yourself' });
      }
      const [userAId, userBId] = [ctx.userId, input.userId].sort();
      const existing = await ctx.db.connection.findUnique({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
      });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Already connected' });
      }
      return ctx.db.connection.create({ data: { userAId: userAId!, userBId: userBId! } });
    }),

  getCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.connection.count({
      where: { OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }] },
    });
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

    // Lightweight BFS: depth 1-3, NO path tracking (saves huge temp file usage)
    const recipients = await ctx.db.$queryRaw<Array<{
      user_id: string;
      depth: number;
      max_conn_at: Date | null;
    }>>`
      WITH RECURSIVE bfs AS (
        SELECT
          CASE WHEN c."userAId" = ${bfsUserId} THEN c."userBId" ELSE c."userAId" END AS user_id,
          1 AS depth,
          c."createdAt" AS max_conn_at
        FROM connections c
        WHERE c."userAId" = ${bfsUserId} OR c."userBId" = ${bfsUserId}

        UNION ALL

        SELECT
          CASE WHEN c."userAId" = b.user_id THEN c."userBId" ELSE c."userAId" END AS user_id,
          b.depth + 1,
          GREATEST(b.max_conn_at, c."createdAt")
        FROM connections c
        JOIN bfs b ON (c."userAId" = b.user_id OR c."userBId" = b.user_id)
        WHERE b.depth < 3
      )
      SELECT DISTINCT ON (b.user_id) b.user_id, b.depth, b.max_conn_at
      FROM bfs b
      JOIN users u ON u.id = b.user_id
      WHERE b.user_id != ${bfsUserId} AND u."deletedAt" IS NULL
      ORDER BY b.user_id, b.depth, b.max_conn_at
      LIMIT 500
    `;

    const byDepth: Record<number, number> = {};
    const userIdsByDepth: Record<number, string[]> = {};
    const connAtMap = new Map<string, Date | null>();

    for (const r of recipients) {
      byDepth[r.depth] = (byDepth[r.depth] || 0) + 1;
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
      totalReachable: recipients.length + 1,
      byDepth,
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

      await ctx.db.connection.delete({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
      });

      // Create pending as if target requested connection (awaiting my confirmation)
      await ctx.db.pendingConnection.upsert({
        where: { fromUserId_toUserId: { fromUserId: input.targetUserId, toUserId: ctx.userId } },
        create: { fromUserId: input.targetUserId, toUserId: ctx.userId, createdAt: new Date() },
        update: { status: 'PENDING', resolvedAt: null },
      });

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
