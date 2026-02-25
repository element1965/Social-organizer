import { z } from 'zod';
import { randomBytes } from 'crypto';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { sendPendingNotification } from '../services/notification.service.js';
import { scanMatchesForUser } from '../services/match-notification.service.js';
import { sendTelegramMessage, type TgReplyMarkup } from '../services/telegram-bot.service.js';
import { translateWithCache } from '../services/translate.service.js';

export const inviteRouter = router({
  generate: protectedProcedure.mutation(async ({ ctx }) => {
    const token = randomBytes(16).toString('hex');
    const invite = await ctx.db.inviteLink.create({
      data: { inviterId: ctx.userId, token },
    });
    return { token: invite.token, id: invite.id };
  }),

  accept: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      console.log('[invite.accept] userId:', ctx.userId, 'token:', input.token.slice(0, 8) + '...');

      // Try single-use invite token first
      const invite = await ctx.db.inviteLink.findUnique({
        where: { token: input.token },
      });

      let inviterId: string;

      if (invite) {
        if (invite.usedById) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite already used' });
        if (invite.inviterId === ctx.userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot accept own invite' });
        }
        inviterId = invite.inviterId;

        await ctx.db.inviteLink.update({
          where: { id: invite.id },
          data: { usedById: ctx.userId, usedAt: new Date() },
        });
      } else {
        // Try as permanent link (token = userId), then by referralSlug
        let user = await ctx.db.user.findUnique({ where: { id: input.token } });
        if (!user) {
          user = await ctx.db.user.findUnique({ where: { referralSlug: input.token.toLowerCase() } });
        }
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
        if (user.id === ctx.userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot connect to yourself' });
        }
        inviterId = user.id;
      }

      // Check if already connected
      const [userAId, userBId] = [ctx.userId, inviterId].sort();
      const existingConnection = await ctx.db.connection.findUnique({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
      });
      if (existingConnection) {
        console.log('[invite.accept] already connected:', ctx.userId, '<->', inviterId);
        return { success: true, alreadyConnected: true, connectedWith: inviterId };
      }

      // Check if pending connection already exists in either direction
      const existingPending = await ctx.db.pendingConnection.findFirst({
        where: {
          OR: [
            { fromUserId: ctx.userId, toUserId: inviterId, status: 'PENDING' },
            { fromUserId: inviterId, toUserId: ctx.userId, status: 'PENDING' },
          ],
        },
      });

      // If reverse pending exists (inviter already sent request to me) — auto-connect
      if (existingPending && existingPending.fromUserId === inviterId) {
        await ctx.db.pendingConnection.update({
          where: { id: existingPending.id },
          data: { status: 'ACCEPTED', resolvedAt: new Date() },
        });
        await ctx.db.connection.upsert({
          where: { userAId_userBId: { userAId: [ctx.userId, inviterId].sort()[0]!, userBId: [ctx.userId, inviterId].sort()[1]! } },
          create: { userAId: [ctx.userId, inviterId].sort()[0]!, userBId: [ctx.userId, inviterId].sort()[1]! },
          update: {},
        });
        console.log('[invite.accept] auto-connected (reverse pending):', ctx.userId, '<->', inviterId);
        const applicant = await ctx.db.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
        sendPendingNotification(ctx.db, inviterId, 'accepted', applicant?.name || '').catch(() => {});
        scanMatchesForUser(ctx.db, ctx.userId).catch(() => {});
        scanMatchesForUser(ctx.db, inviterId).catch(() => {});
        return { success: true, alreadyConnected: true, connectedWith: inviterId };
      }

      if (existingPending) {
        return { success: true, pending: true, connectedWith: inviterId };
      }

      // Create pending connection (fromUser = person clicking link, toUser = link owner)
      await ctx.db.pendingConnection.upsert({
        where: { fromUserId_toUserId: { fromUserId: ctx.userId, toUserId: inviterId } },
        create: { fromUserId: ctx.userId, toUserId: inviterId },
        update: { status: 'PENDING', resolvedAt: null },
      });

      console.log('[invite.accept] pending connection created:', ctx.userId, '->', inviterId);

      // TG notification to link owner (fire-and-forget)
      const applicant = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { name: true, onboardingCompleted: true, language: true, platformAccounts: { where: { platform: 'TELEGRAM' }, select: { platformId: true } } },
      });
      sendPendingNotification(ctx.db, inviterId, 'new', applicant?.name || '').catch(() => {});

      // Immediate CTA: if user hasn't completed onboarding, send TG message (fire-and-forget)
      if (applicant && !applicant.onboardingCompleted) {
        const tgAccount = applicant.platformAccounts[0];
        if (tgAccount) {
          const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';
          const ctaText = '✅ Ты принял приглашение! Добавь один контакт — и ты в сети.';
          const ctaBtnText = 'Открыть приложение';
          const userLang = applicant.language || 'en';

          (async () => {
            let text = ctaText;
            let btnText = ctaBtnText;
            if (userLang !== 'ru') {
              try {
                [text, btnText] = await Promise.all([
                  translateWithCache(ctaText, userLang),
                  translateWithCache(ctaBtnText, userLang),
                ]);
              } catch { /* keep Russian */ }
            }
            const markup: TgReplyMarkup = {
              inline_keyboard: [[{ text: `📱 ${btnText}`, web_app: { url: WEB_APP_URL } }]],
            };
            await sendTelegramMessage(tgAccount.platformId, text, markup);
          })().catch(() => {});
        }
      }

      return { success: true, pending: true, connectedWith: inviterId };
    }),

  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      // Try single-use invite first
      const invite = await ctx.db.inviteLink.findUnique({
        where: { token: input.token },
        include: { inviter: { select: { id: true, name: true, photoUrl: true } } },
      });
      if (invite) return invite;

      // Try as permanent link (token = userId), then by referralSlug
      let user = await ctx.db.user.findUnique({
        where: { id: input.token },
        select: { id: true, name: true, photoUrl: true },
      });
      if (!user) {
        user = await ctx.db.user.findUnique({
          where: { referralSlug: input.token.toLowerCase() },
          select: { id: true, name: true, photoUrl: true },
        });
      }
      if (user) {
        return {
          id: `permanent-${user.id}`,
          token: input.token,
          inviterId: user.id,
          usedById: null,
          usedAt: null,
          createdAt: new Date(),
          inviter: user,
        };
      }

      throw new TRPCError({ code: 'NOT_FOUND' });
    }),
});
