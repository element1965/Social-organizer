import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { GRAPH_SLICE_DEPTH, MAX_BFS_DEPTH, MAX_BFS_RECIPIENTS } from '@so/shared';
import { getGraphSlice, findPathBetweenUsers, findRecipientsViaBfs } from '../services/bfs.service.js';

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
    const recipients = await findRecipientsViaBfs(ctx.db, ctx.userId, MAX_BFS_DEPTH, MAX_BFS_RECIPIENTS, []);
    const byDepth: Record<number, number> = {};
    const userIdsByDepth: Record<number, string[]> = {};

    for (const r of recipients) {
      byDepth[r.depth] = (byDepth[r.depth] || 0) + 1;
      if (!userIdsByDepth[r.depth]) userIdsByDepth[r.depth] = [];
      userIdsByDepth[r.depth]!.push(r.userId);
    }

    // Get all unique user IDs
    const allUserIds = recipients.map((r) => r.userId);

    // Fetch user details and their connection counts in parallel
    const [users, connectionCounts] = await Promise.all([
      ctx.db.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, name: true, photoUrl: true, remainingBudget: true },
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
    const usersByDepth: Record<number, Array<{ id: string; name: string; photoUrl: string | null; connectionCount: number; remainingBudget: number | null }>> = {};
    for (const [depth, userIds] of Object.entries(userIdsByDepth)) {
      usersByDepth[Number(depth)] = userIds.map((id) => {
        const user = userMap.get(id);
        return {
          id,
          name: user?.name || 'Unknown',
          photoUrl: user?.photoUrl || null,
          connectionCount: countMap.get(id) || 0,
          remainingBudget: user?.remainingBudget ?? null,
        };
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
      totalReachable: recipients.length,
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
