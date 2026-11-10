import { z } from 'zod';
import { randomBytes } from 'crypto';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { sendPendingNotification } from '../services/notification.service.js';
import { scanMatchesForUser } from '../services/match-notification.service.js';
import { respondToConnectionRequest, createConnectionWithinLimit, connectInPersonTx } from '../services/connection-request.service.js';
import { sendTelegramMessage, type TgReplyMarkup } from '../services/telegram-bot.service.js';
import { syncMilestonesForPair } from '../services/milestone.service.js';
import { translateWithCache } from '../services/translate.service.js';

const INVITE_EXPIRED_MESSAGE = 'INVITE_EXPIRED: This invite has expired';

export const inviteRouter = router({
  /**
   * Without ttl: the usual single-use link (no expiry), exactly as before.
   * With ttl (seconds): a short-lived in-person token (live QR). Accepting it connects both people
   * immediately, with no pending confirmation: meeting in person is the first handshake.
   */
  generate: protectedProcedure
    .input(z.object({ ttl: z.number().int().min(10).max(24 * 60 * 60).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const token = randomBytes(16).toString('hex');
      const expiresAt = input?.ttl ? new Date(Date.now() + input.ttl * 1000) : null;
      const invite = await ctx.db.inviteLink.create({
        data: { inviterId: ctx.userId, token, expiresAt },
      });
      return { token: invite.token, id: invite.id, expiresAt: invite.expiresAt };
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
      let inPerson = false;

      if (invite) {
        // The same person opening their link again (another device, a repeat after login) is not an error
        if (invite.usedById && invite.usedById !== ctx.userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite already used' });
        }
        if (invite.inviterId === ctx.userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot accept own invite' });
        }
        inviterId = invite.inviterId;
        inPerson = invite.expiresAt != null;

        if (!invite.usedById) {
          if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
            throw new TRPCError({ code: 'NOT_FOUND', message: INVITE_EXPIRED_MESSAGE });
          }
          // In-person tokens are claimed later, in the same transaction as the connection
          if (!invite.expiresAt) {
            await ctx.db.inviteLink.updateMany({
              where: { id: invite.id, usedById: null },
              data: { usedById: ctx.userId, usedAt: new Date() },
            });
          }
        }
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

      // A deleted inviter can never answer — tell the newcomer instead of creating a dead request
      const inviter = await ctx.db.user.findUnique({ where: { id: inviterId }, select: { deletedAt: true } });
      if (!inviter || inviter.deletedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'INVITER_DELETED' });
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

      // In-person (QR) token: the meeting is the first handshake, so connect right away, no confirmation step
      if (inPerson) {
        // Claim + connection are atomic: if the 150 limit fails, the token stays unused
        await ctx.db.$transaction(async (tx) => {
          const claimed = await tx.inviteLink.updateMany({
            where: {
              id: invite!.id,
              OR: [{ usedById: null, expiresAt: { gt: new Date() } }, { usedById: ctx.userId }],
            },
            data: { usedById: ctx.userId, usedAt: invite!.usedAt ?? new Date() },
          });
          if (claimed.count === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite already used' });
          }
          await connectInPersonTx(tx, ctx.userId, inviterId);
        });
        await syncMilestonesForPair(ctx.db, ctx.userId, inviterId);
        const scanner = await ctx.db.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
        sendPendingNotification(ctx.db, inviterId, 'accepted', scanner?.name || '').catch(() => {});
        scanMatchesForUser(ctx.db, ctx.userId).catch(() => {});
        scanMatchesForUser(ctx.db, inviterId).catch(() => {});
        return { success: true, alreadyConnected: false, connectedWith: inviterId };
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
        await respondToConnectionRequest(ctx.db, existingPending.id, ctx.userId, 'accept');
        console.log('[invite.accept] auto-connected (reverse pending):', ctx.userId, '<->', inviterId);
        return { success: true, alreadyConnected: true, connectedWith: inviterId };
      }

      if (existingPending) {
        return { success: true, pending: true, connectedWith: inviterId };
      }

      // Create pending connection (fromUser = person clicking link, toUser = link owner)
      const created = await ctx.db.pendingConnection.upsert({
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
      sendPendingNotification(ctx.db, inviterId, 'new', applicant?.name || '', undefined, created.id).catch(() => {});

      // Immediate CTA: if user hasn't completed onboarding, send TG message (fire-and-forget)
      if (applicant && !applicant.onboardingCompleted) {
        const tgAccount = applicant.platformAccounts[0];
        if (tgAccount) {
          const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';
          const userLang = applicant.language || 'en';

          (async () => {
            const contactCount = await ctx.db.userContact.count({ where: { userId: ctx.userId } });
            const missing = Math.max(0, 2 - contactCount);
            let ctaText: string;
            if (missing > 0) {
              ctaText = `✅ Приглашение принято! Добавьте ещё ${missing} контакт(ов), чтобы завершить профиль.`;
            } else {
              ctaText = '✅ Приглашение принято! Завершите профиль, чтобы начать.';
            }
            const ctaBtnText = 'Открыть приложение';

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

  acceptSos: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
        select: { id: true, creatorId: true, status: true },
      });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found' });

      const creatorId = collection.creatorId;
      if (creatorId === ctx.userId) {
        return { success: true, alreadyConnected: true, connectedWith: creatorId };
      }

      const [userAId, userBId] = [ctx.userId, creatorId].sort();
      const existing = await ctx.db.connection.findUnique({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
      });
      if (existing) {
        return { success: true, alreadyConnected: true, connectedWith: creatorId };
      }

      // A closed, cancelled, or held collection must not add a handshake.
      if (collection.status !== 'ACTIVE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection is not active' });
      }

      // Create direct connection (SOS bypasses pending approval, but not the 150 limit).
      // viaCollectionId is written only on this create, never on an existing friendship.
      const outcome = await ctx.db.$transaction(async (tx) => {
        const created = await createConnectionWithinLimit(tx, ctx.userId, creatorId, {
          viaCollectionId: collection.id,
        });
        if (created !== 'created') return created;
        await tx.pendingConnection.updateMany({
          where: {
            OR: [
              { fromUserId: ctx.userId, toUserId: creatorId },
              { fromUserId: creatorId, toUserId: ctx.userId },
            ],
            status: 'PENDING',
          },
          data: { status: 'ACCEPTED', resolvedAt: new Date() },
        });
        return created;
      });
      if (outcome !== 'created') {
        return { success: true, alreadyConnected: true, connectedWith: creatorId };
      }

      await syncMilestonesForPair(ctx.db, ctx.userId, creatorId);

      const applicant = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { name: true },
      });
      sendPendingNotification(ctx.db, creatorId, 'accepted', applicant?.name || '').catch(() => {});
      scanMatchesForUser(ctx.db, ctx.userId).catch(() => {});
      scanMatchesForUser(ctx.db, creatorId).catch(() => {});

      return { success: true, alreadyConnected: false, connectedWith: creatorId };
    }),

  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const getInviterStats = async (userId: string) => {
        const [connectionsFrom, connectionsTo, intentions] = await Promise.all([
          ctx.db.connection.count({ where: { userAId: userId } }),
          ctx.db.connection.count({ where: { userBId: userId } }),
          // "Declared intentions" = the inviter's own recorded participation in collections
          // (an intention is participation, SO-40), not the goals of the inviter's collections.
          ctx.db.obligation.aggregate({
            where: { userId, collection: { status: { not: 'CANCELLED' } } },
            _sum: { amount: true },
          }),
        ]);
        const networkCount = connectionsFrom + connectionsTo;
        const totalIntentions = intentions._sum.amount ?? 0;
        return { networkCount, totalIntentions };
      };

      // Try single-use invite first
      const invite = await ctx.db.inviteLink.findUnique({
        where: { token: input.token },
        include: { inviter: { select: { id: true, name: true, photoUrl: true, deletedAt: true } } },
      });
      if (invite) {
        if (invite.inviter.deletedAt) throw new TRPCError({ code: 'NOT_FOUND', message: 'INVITER_DELETED' });
        if (invite.expiresAt && !invite.usedById && invite.expiresAt.getTime() <= Date.now()) {
          throw new TRPCError({ code: 'NOT_FOUND', message: INVITE_EXPIRED_MESSAGE });
        }
        const stats = await getInviterStats(invite.inviterId);
        return { ...invite, ...stats };
      }

      // Try as permanent link (token = userId), then by referralSlug
      let user = await ctx.db.user.findUnique({
        where: { id: input.token },
        select: { id: true, name: true, photoUrl: true, deletedAt: true },
      });
      if (!user) {
        user = await ctx.db.user.findUnique({
          where: { referralSlug: input.token.toLowerCase() },
          select: { id: true, name: true, photoUrl: true, deletedAt: true },
        });
      }
      if (user?.deletedAt) throw new TRPCError({ code: 'NOT_FOUND', message: 'INVITER_DELETED' });
      if (user) {
        const stats = await getInviterStats(user.id);
        return {
          id: `permanent-${user.id}`,
          token: input.token,
          inviterId: user.id,
          usedById: null,
          usedAt: null,
          createdAt: new Date(),
          inviter: { id: user.id, name: user.name, photoUrl: user.photoUrl },
          ...stats,
        };
      }

      throw new TRPCError({ code: 'NOT_FOUND' });
    }),
});
