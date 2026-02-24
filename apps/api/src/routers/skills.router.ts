import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { isAdmin } from '../admin.js';
import { createSkillMatchNotifications, createNeedMatchNotifications } from '../services/match-notification.service.js';

export const skillsRouter = router({
  categories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.skillCategory.findMany({
      orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
    });
  }),

  mine: protectedProcedure.query(async ({ ctx }) => {
    const [skills, needs, user] = await Promise.all([
      ctx.db.userSkill.findMany({
        where: { userId: ctx.userId },
        include: { category: true },
      }),
      ctx.db.userNeed.findMany({
        where: { userId: ctx.userId },
        include: { category: true },
      }),
      ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { skillsCompleted: true },
      }),
    ]);
    return { skills, needs, skillsCompleted: user?.skillsCompleted ?? false };
  }),

  forUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [skills, needs] = await Promise.all([
        ctx.db.userSkill.findMany({
          where: { userId: input.userId },
          include: { category: true },
        }),
        ctx.db.userNeed.findMany({
          where: { userId: input.userId },
          include: { category: true },
        }),
      ]);
      return { skills, needs };
    }),

  saveSkills: protectedProcedure
    .input(z.object({
      skills: z.array(z.object({
        categoryId: z.string(),
        note: z.string().max(200).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const oldSkills = await ctx.db.userSkill.findMany({
        where: { userId: ctx.userId },
        select: { categoryId: true },
      });
      const oldIds = new Set(oldSkills.map((s) => s.categoryId));

      await ctx.db.$transaction([
        ctx.db.userSkill.deleteMany({ where: { userId: ctx.userId } }),
        ...input.skills.map((s) =>
          ctx.db.userSkill.create({
            data: { userId: ctx.userId, categoryId: s.categoryId, note: s.note },
          }),
        ),
      ]);

      const addedIds = input.skills.map((s) => s.categoryId).filter((id) => !oldIds.has(id));
      if (addedIds.length > 0) {
        createSkillMatchNotifications(ctx.db, ctx.userId, addedIds).catch((err) =>
          console.error('[SkillMatch] Error:', err),
        );
      }

      return { success: true };
    }),

  saveNeeds: protectedProcedure
    .input(z.object({
      needs: z.array(z.object({
        categoryId: z.string(),
        note: z.string().max(200).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const oldNeeds = await ctx.db.userNeed.findMany({
        where: { userId: ctx.userId },
        select: { categoryId: true },
      });
      const oldIds = new Set(oldNeeds.map((n) => n.categoryId));

      await ctx.db.$transaction([
        ctx.db.userNeed.deleteMany({ where: { userId: ctx.userId } }),
        ...input.needs.map((n) =>
          ctx.db.userNeed.create({
            data: { userId: ctx.userId, categoryId: n.categoryId, note: n.note },
          }),
        ),
      ]);

      const addedIds = input.needs.map((n) => n.categoryId).filter((id) => !oldIds.has(id));
      if (addedIds.length > 0) {
        createNeedMatchNotifications(ctx.db, ctx.userId, addedIds).catch((err) =>
          console.error('[SkillMatch] Error:', err),
        );
      }

      return { success: true };
    }),

  markCompleted: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.userId },
      data: { skillsCompleted: true },
    });
    return { success: true };
  }),

  adminStats: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdmin(ctx.userId)) return null;

    const [totalUsers, skillUserRows, needUserRows, topSkills, topNeeds] = await Promise.all([
      ctx.db.user.count({ where: { deletedAt: null } }),
      ctx.db.userSkill.groupBy({ by: ['userId'] }),
      ctx.db.userNeed.groupBy({ by: ['userId'] }),
      ctx.db.userSkill.groupBy({
        by: ['categoryId'],
        _count: { categoryId: true },
        orderBy: { _count: { categoryId: 'desc' } },
        take: 5,
      }),
      ctx.db.userNeed.groupBy({
        by: ['categoryId'],
        _count: { categoryId: true },
        orderBy: { _count: { categoryId: 'desc' } },
        take: 5,
      }),
    ]);

    const usersWithSkills = skillUserRows.length;
    const usersWithNeeds = needUserRows.length;

    // Match density: count skill→need matches between connected users
    const matchResult = await ctx.db.$queryRaw<Array<{ matches: number }>>`
      SELECT COUNT(DISTINCT (s."userId", n."userId", s."categoryId"))::int AS matches
      FROM user_skills s
      JOIN user_needs n ON s."categoryId" = n."categoryId" AND s."userId" <> n."userId"
      JOIN connections c ON (c."userAId" = s."userId" AND c."userBId" = n."userId")
                         OR (c."userBId" = s."userId" AND c."userAId" = n."userId")
    `;

    // Resolve category keys for top lists
    const catIds = [...new Set([
      ...topSkills.map((s) => s.categoryId),
      ...topNeeds.map((n) => n.categoryId),
    ])];
    const cats = catIds.length > 0
      ? await ctx.db.skillCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, key: true } })
      : [];
    const catMap = new Map(cats.map((c) => [c.id, c.key]));

    return {
      totalUsers,
      usersWithSkills,
      usersWithNeeds,
      fillRate: totalUsers > 0 ? Math.round(((usersWithSkills + usersWithNeeds) / 2 / totalUsers) * 100) : 0,
      matchDensity: matchResult[0]?.matches ?? 0,
      topSkills: topSkills.map((s) => ({ key: catMap.get(s.categoryId) ?? s.categoryId, count: s._count.categoryId })),
      topNeeds: topNeeds.map((n) => ({ key: catMap.get(n.categoryId) ?? n.categoryId, count: n._count.categoryId })),
    };
  }),

  matchHints: protectedProcedure.query(async ({ ctx }) => {
    const needs = await ctx.db.userNeed.findMany({
      where: { userId: ctx.userId },
    });
    if (needs.length === 0) return [];

    const categoryIds = needs.map((n) => n.categoryId);
    const results = await ctx.db.$queryRaw<Array<{ category_id: string; key: string; cnt: number }>>`
      SELECT un."categoryId" AS category_id, sc.key, COUNT(DISTINCT us."userId")::int AS cnt
      FROM user_needs un
      JOIN skill_categories sc ON sc.id = un."categoryId"
      JOIN user_skills us ON us."categoryId" = un."categoryId"
      JOIN connections c
        ON (c."userAId" = ${ctx.userId} AND c."userBId" = us."userId")
        OR (c."userBId" = ${ctx.userId} AND c."userAId" = us."userId")
      WHERE un."userId" = ${ctx.userId}
        AND un."categoryId" = ANY(${categoryIds})
      GROUP BY un."categoryId", sc.key
      HAVING COUNT(DISTINCT us."userId") > 0
      ORDER BY cnt DESC
      LIMIT 3
    `;

    return results.map((r) => ({ categoryId: r.category_id, key: r.key, friendsCount: r.cnt }));
  }),
});
