import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { isAdmin } from '../admin.js';
import { sendTelegramMessage } from '../services/telegram-bot.service.js';

function assertAdmin(userId: string) {
  if (!isAdmin(userId)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
}

export const supportRouter = router({
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.userId!);
    const messages = await ctx.db.supportMessage.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, photoUrl: true } } },
    });
    // Group by userId / platformId — one entry per conversation thread
    const map = new Map<string, {
      key: string;
      userId: string | null;
      platformId: string | null;
      userName: string | null;
      photoUrl: string | null;
      lastMessage: string;
      lastAt: Date;
      totalCount: number;
    }>();
    for (const msg of messages) {
      const key = msg.userId ?? msg.platformId ?? 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          key,
          userId: msg.userId,
          platformId: msg.platformId,
          userName: msg.userName ?? msg.user?.name ?? null,
          photoUrl: msg.user?.photoUrl ?? null,
          lastMessage: msg.message,
          lastAt: msg.createdAt,
          totalCount: 1,
        });
      } else {
        map.get(key)!.totalCount++;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  }),

  getMessages: protectedProcedure
    .input(z.object({ userId: z.string().optional(), platformId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);
      if (!input.userId && !input.platformId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'userId or platformId required' });
      }
      return ctx.db.supportMessage.findMany({
        where: input.userId ? { userId: input.userId } : { platformId: input.platformId! },
        orderBy: { createdAt: 'asc' },
      });
    }),

  sendReply: protectedProcedure
    .input(z.object({
      userId: z.string().optional(),
      platformId: z.string().optional(),
      userName: z.string().optional(),
      message: z.string().min(1).max(4000),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);
      if (!input.userId && !input.platformId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'userId or platformId required' });
      }

      // Resolve Telegram platformId so admin can reply directly via bot
      let platformId = input.platformId;
      if (!platformId && input.userId) {
        const account = await ctx.db.platformAccount.findFirst({
          where: { userId: input.userId, platform: 'TELEGRAM' },
          select: { platformId: true },
        });
        platformId = account?.platformId ?? undefined;
      }

      const msg = await ctx.db.supportMessage.create({
        data: {
          userId: input.userId ?? null,
          platformId: platformId ?? input.platformId ?? null,
          userName: input.userName ?? null,
          fromAdmin: true,
          adminId: ctx.userId!,
          message: input.message,
        },
      });

      // Send via Telegram bot (fire-and-forget)
      if (platformId) {
        sendTelegramMessage(platformId, `📩 <b>Support:</b> ${input.message}`).catch((err) =>
          console.error('[Support] TG reply failed:', err),
        );
      }

      return msg;
    }),
});
