import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { isAdmin } from '../admin.js';
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramVideo,
  sendTelegramDocument,
} from '../services/telegram-bot.service.js';

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
          lastMessage: msg.message || (msg.mediaType ? `[${msg.mediaType}]` : ''),
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
      message: z.string().max(4000).default(''),
      mediaFileId: z.string().optional(),
      mediaType: z.enum(['photo', 'video', 'document']).optional(),
      mediaName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);
      if (!input.userId && !input.platformId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'userId or platformId required' });
      }
      if (!input.message && !input.mediaFileId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'message or media required' });
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
          mediaFileId: input.mediaFileId ?? null,
          mediaType: input.mediaType ?? null,
          mediaName: input.mediaName ?? null,
        },
      });

      // Send via Telegram bot (fire-and-forget)
      if (platformId) {
        const caption = input.message || undefined;
        if (input.mediaFileId && input.mediaType === 'photo') {
          sendTelegramPhoto(platformId, input.mediaFileId, caption).catch((err) =>
            console.error('[Support] TG photo reply failed:', err),
          );
        } else if (input.mediaFileId && input.mediaType === 'video') {
          sendTelegramVideo(platformId, input.mediaFileId, caption).catch((err) =>
            console.error('[Support] TG video reply failed:', err),
          );
        } else if (input.mediaFileId && input.mediaType === 'document') {
          sendTelegramDocument(platformId, input.mediaFileId, caption).catch((err) =>
            console.error('[Support] TG document reply failed:', err),
          );
        } else if (input.message) {
          sendTelegramMessage(platformId, `📩 ${input.message}`).catch((err) =>
            console.error('[Support] TG reply failed:', err),
          );
        }
      }

      return msg;
    }),
});
