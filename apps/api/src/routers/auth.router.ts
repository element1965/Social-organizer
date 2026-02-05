import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import {
  createAccessToken,
  createRefreshToken,
  verifyToken,
  generateLinkingCode,
} from '../services/auth.service.js';
import { validateTelegramInitData } from '../services/telegram.service.js';
import { LINKING_CODE_TTL_MINUTES } from '@so/shared';

export const authRouter = router({
  registerWithEmail: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(6),
      name: z.string().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existingUser = await ctx.db.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });

      if (existingUser) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      const user = await ctx.db.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash,
          name: input.name || input.email.split('@')[0] || 'User',
        },
      });

      const accessToken = createAccessToken(user.id);
      const refreshToken = createRefreshToken(user.id);

      return { accessToken, refreshToken, userId: user.id };
    }),

  loginWithEmail: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });

      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      }

      const validPassword = await bcrypt.compare(input.password, user.passwordHash);
      if (!validPassword) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      }

      const accessToken = createAccessToken(user.id);
      const refreshToken = createRefreshToken(user.id);

      return { accessToken, refreshToken, userId: user.id };
    }),

  loginWithTelegram: publicProcedure
    .input(z.object({
      initData: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const tgUser = validateTelegramInitData(input.initData);
      if (!tgUser) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid Telegram initData' });
      }

      const platformId = String(tgUser.id);

      let platformAccount = await ctx.db.platformAccount.findUnique({
        where: {
          platform_platformId: {
            platform: 'TELEGRAM',
            platformId,
          },
        },
        include: { user: true },
      });

      let userId: string;

      if (platformAccount) {
        userId = platformAccount.userId;
        // Update user photo if changed
        if (tgUser.photo_url && platformAccount.user.photoUrl !== tgUser.photo_url) {
          await ctx.db.user.update({
            where: { id: userId },
            data: { photoUrl: tgUser.photo_url },
          });
        }
      } else {
        const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || `User_${platformId}`;
        const user = await ctx.db.user.create({
          data: {
            name,
            photoUrl: tgUser.photo_url || null,
            platformAccounts: {
              create: {
                platform: 'TELEGRAM',
                platformId,
                accessToken: input.initData,
              },
            },
          },
        });
        userId = user.id;
      }

      const accessToken = createAccessToken(userId);
      const refreshToken = createRefreshToken(userId);

      return { accessToken, refreshToken, userId };
    }),

  loginWithPlatform: publicProcedure
    .input(z.object({
      platform: z.enum(['FACEBOOK', 'TELEGRAM', 'APPLE', 'GOOGLE']),
      platformToken: z.string().min(1),
      name: z.string().optional(),
      photoUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const platformId = input.platformToken;

      let platformAccount = await ctx.db.platformAccount.findUnique({
        where: {
          platform_platformId: {
            platform: input.platform,
            platformId,
          },
        },
        include: { user: true },
      });

      let userId: string;

      if (platformAccount) {
        userId = platformAccount.userId;
      } else {
        const user = await ctx.db.user.create({
          data: {
            name: input.name || `User_${platformId.slice(0, 8)}`,
            photoUrl: input.photoUrl,
            platformAccounts: {
              create: {
                platform: input.platform,
                platformId,
                accessToken: input.platformToken,
              },
            },
          },
        });
        userId = user.id;
      }

      const accessToken = createAccessToken(userId);
      const refreshToken = createRefreshToken(userId);

      return { accessToken, refreshToken, userId };
    }),

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      const payload = verifyToken(input.refreshToken);
      if (!payload) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid refresh token' });
      }
      const accessToken = createAccessToken(payload.sub);
      const refreshToken = createRefreshToken(payload.sub);
      return { accessToken, refreshToken };
    }),

  generateLinkCode: protectedProcedure
    .mutation(async ({ ctx }) => {
      const code = generateLinkingCode();
      const expiresAt = new Date(Date.now() + LINKING_CODE_TTL_MINUTES * 60 * 1000);
      await ctx.db.linkingCode.create({
        data: { userId: ctx.userId, code, expiresAt },
      });
      return { code, expiresAt };
    }),

  linkAccount: protectedProcedure
    .input(z.object({
      code: z.string().length(6),
      platform: z.enum(['FACEBOOK', 'TELEGRAM', 'APPLE', 'GOOGLE']),
      platformToken: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const linkingCode = await ctx.db.linkingCode.findFirst({
        where: { code: input.code, expiresAt: { gt: new Date() } },
      });
      if (!linkingCode) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid or expired code' });
      }
      await ctx.db.platformAccount.create({
        data: {
          userId: linkingCode.userId,
          platform: input.platform,
          platformId: input.platformToken,
          accessToken: input.platformToken,
        },
      });
      await ctx.db.linkingCode.delete({ where: { id: linkingCode.id } });
      return { success: true, linkedUserId: linkingCode.userId };
    }),
});
