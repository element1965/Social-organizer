import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { MIN_COLLECTION_AMOUNT, CURRENCY_CODES, NOTIFICATION_RATIO } from '@so/shared';
import { sendCollectionNotifications } from '../services/notification.service';

export const collectionRouter = router({
  create: protectedProcedure
    .input(z.object({
      type: z.enum(['EMERGENCY', 'REGULAR']),
      amount: z.number().min(MIN_COLLECTION_AMOUNT).nullable().optional(),
      currency: z.string().refine((c) => CURRENCY_CODES.includes(c), 'Unsupported currency'),
      chatLink: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Проверить роль создателя
      const creator = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { role: true },
      });
      if (!creator) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const isSpecial = creator.role === 'AUTHOR' || creator.role === 'DEVELOPER';

      // Обычные пользователи обязаны указать сумму
      if (!isSpecial && (input.amount == null || input.amount < MIN_COLLECTION_AMOUNT)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Amount must be at least ${MIN_COLLECTION_AMOUNT}` });
      }

      // Лимит: макс 1 экстренный + 1 регулярный одновременно
      const existingActive = await ctx.db.collection.count({
        where: {
          creatorId: ctx.userId,
          type: input.type,
          status: { in: ['ACTIVE', 'BLOCKED'] },
        },
      });
      if (existingActive > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `You already have an active ${input.type.toLowerCase()} collection`,
        });
      }

      const collection = await ctx.db.collection.create({
        data: {
          creatorId: ctx.userId,
          type: input.type,
          amount: input.amount ?? null,
          currency: input.currency,
          chatLink: input.chatLink,
          currentCycleStart: input.type === 'REGULAR' ? new Date() : null,
        },
      });

      // BFS-рассылка НЕ отправляется для спецпрофилей (Автор/Разработчик)
      // Их уведомления приходят через special-notify worker после первого обязательства
      if (!isSpecial && input.amount != null) {
        const maxRecipients = Math.ceil(input.amount / NOTIFICATION_RATIO);
        await sendCollectionNotifications(ctx.db, collection.id, ctx.userId, 'NEW_COLLECTION', 1, maxRecipients);
      }

      return collection;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({
        where: { id: input.id },
        include: {
          creator: { select: { id: true, name: true, photoUrl: true } },
          obligations: {
            include: { user: { select: { id: true, name: true, photoUrl: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      const currentAmount = collection.obligations.reduce((sum, o) => sum + o.amount, 0);
      return { ...collection, currentAmount };
    }),

  close: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({ where: { id: input.id } });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (collection.status !== 'ACTIVE' && collection.status !== 'BLOCKED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection not active' });
      }
      return ctx.db.collection.update({
        where: { id: input.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({ where: { id: input.id } });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (collection.status !== 'ACTIVE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only cancel active collections' });
      }
      return ctx.db.collection.update({
        where: { id: input.id }, data: { status: 'CANCELLED' },
      });
    }),

  myActive: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.collection.findMany({
      where: { creatorId: ctx.userId, status: { in: ['ACTIVE', 'BLOCKED'] } },
      include: { _count: { select: { obligations: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }),

  myParticipating: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.obligation.findMany({
      where: { userId: ctx.userId },
      include: {
        collection: {
          include: { creator: { select: { id: true, name: true, photoUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }),
});
