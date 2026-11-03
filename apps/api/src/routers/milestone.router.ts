import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { MILESTONES, syncMilestones } from '../services/milestone.service.js';
import { countConnections } from '../services/connection-request.service.js';

const kindSchema = z.enum(['FIRST_CONNECTION', 'TEN_CONNECTIONS']);

export const milestoneRouter = router({
  /** Both milestones of the current user with the current number of direct connections. */
  list: protectedProcedure.query(async ({ ctx }) => {
    // Catch up from saved connections (old accounts, or a missed sync) without a "new" confirmation
    await syncMilestones(ctx.db, ctx.userId, { restored: true });

    const [rows, current] = await Promise.all([
      ctx.db.userMilestone.findMany({ where: { userId: ctx.userId } }),
      countConnections(ctx.db, ctx.userId),
    ]);

    // The related person is shown only while they are still a direct connection and the account exists:
    // a removed connection or a deleted account reveals nothing (the date and the fact stay).
    const relatedIds = rows.map((r) => r.relatedUserId).filter((id): id is string => !!id);
    const visible = relatedIds.length
      ? await ctx.db.connection.findMany({
          where: {
            OR: relatedIds.flatMap((id) => [
              { userAId: ctx.userId, userBId: id },
              { userAId: id, userBId: ctx.userId },
            ]),
          },
          select: {
            userA: { select: { id: true, name: true, photoUrl: true, deletedAt: true } },
            userB: { select: { id: true, name: true, photoUrl: true, deletedAt: true } },
          },
        })
      : [];
    const people = new Map<string, { id: string; name: string; photoUrl: string | null }>();
    for (const c of visible) {
      const other = c.userA.id === ctx.userId ? c.userB : c.userA;
      if (!other.deletedAt) people.set(other.id, { id: other.id, name: other.name, photoUrl: other.photoUrl });
    }

    return {
      current,
      items: MILESTONES.map((m) => {
        const row = rows.find((r) => r.kind === m.kind);
        return {
          kind: m.kind,
          threshold: m.threshold,
          achievedAt: row?.achievedAt ?? null,
          seen: row ? row.seenAt != null : true,
          person: row?.relatedUserId ? people.get(row.relatedUserId) ?? null : null,
        };
      }),
    };
  }),

  /** The short confirmation was shown (or closed) — never show it again, on any device. */
  markSeen: protectedProcedure
    .input(z.object({ kind: kindSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.userMilestone.updateMany({
        where: { userId: ctx.userId, kind: input.kind, seenAt: null },
        data: { seenAt: new Date() },
      });
      return { ok: true };
    }),
});
