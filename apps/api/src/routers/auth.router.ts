import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  createAccessToken,
  createRefreshToken,
  verifyToken,
  generateLinkingCode,
} from '../services/auth.service';
import { LINKING_CODE_TTL_MINUTES } from '@so/shared';

export const authRouter = router({
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
