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
import { validateTelegramInitData, validateTelegramWidget, isTelegramWidgetEnabled, type TelegramUserData } from '../services/telegram.service.js';
import { applyBotStartInvite } from '../services/invite-fallback.service.js';
import { findLinkingCode, LinkCodeRateLimitError } from '../services/link-code.service.js';
import type { Context } from '../context.js';
import { linkTelegramByCode, type TelegramLinkResult } from '../services/telegram-link.service.js';
import { verifyGoogleIdToken } from '../services/google.service.js';
import { resolveExternalIdentity, AccountExistsError } from '../services/identity.service.js';
import { requestEmailCode, verifyEmailCode, EmailCodeError } from '../services/email-code.service.js';
import { isMailConfigured, MailUnavailableError } from '../services/mail.service.js';
import { LINKING_CODE_TTL_MINUTES } from '@so/shared';

/** Link-code lookup for tRPC callers: limited per IP, 429 when over the limit (SO-14). */
async function linkCodeOrThrow(ctx: { db: Context['db']; ip: string }, code: string) {
  try {
    return await findLinkingCode(ctx.db, code, [`ip:${ctx.ip}`]);
  } catch (err) {
    if (err instanceof LinkCodeRateLimitError) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: err.message });
    }
    throw err;
  }
}

/**
 * Find or create the user behind a verified Telegram identity (Mini App initData or the
 * web Login Widget) and refresh the profile photo and @username contact. Returns the userId.
 */
async function signInTelegramUser(db: Context['db'], tgUser: TelegramUserData, platformToken: string): Promise<string> {
  const platformId = String(tgUser.id);
  let platformAccount = await db.platformAccount.findUnique({
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
      await db.user.update({
        where: { id: userId },
        data: { photoUrl: tgUser.photo_url },
      });
    }
  } else {
    // Clean up any old soft-deleted users that had this telegram ID
    // (from before hard-delete was implemented in removeBlockedUser)
    const orphanedAccounts = await db.platformAccount.findMany({
      where: { platform: 'TELEGRAM', platformId },
      select: { userId: true },
    });
    for (const oa of orphanedAccounts) {
      await db.user.delete({ where: { id: oa.userId } }).catch(() => {});
    }

    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || `User_${platformId}`;
    const lang = tgUser.language_code?.slice(0, 2) || 'en';
    const user = await db.user.create({
      data: {
        name,
        photoUrl: tgUser.photo_url || null,
        language: lang,
        monthlyBudget: 1,
        remainingBudget: 1,
        onboardingCompleted: true,
        platformAccounts: {
          create: {
            platform: 'TELEGRAM',
            platformId,
            accessToken: platformToken,
          },
        },
      },
    });
    userId = user.id;
  }

  // Auto-save/update Telegram username as contact
  if (tgUser.username) {
    await db.userContact.upsert({
      where: { userId_type: { userId, type: 'telegram' } },
      update: { value: tgUser.username },
      create: { userId, type: 'telegram', value: tgUser.username },
    });
  }

  // Safety net: apply invite token tracked by the bot on /start, in case the
  // mini app lost it (failed load, menu-button open without start_param)
  applyBotStartInvite(db, userId, platformId).catch((err) => {
    console.error('[loginWithTelegram] invite fallback failed:', err);
  });
  return userId;
}

function toEmailCodeTrpcError(err: unknown): unknown {
  if (err instanceof EmailCodeError) {
    const code = err.code === 'RESEND_TOO_SOON' || err.code === 'TOO_MANY_CODES' || err.code === 'TOO_MANY_ATTEMPTS'
      ? 'TOO_MANY_REQUESTS' : 'BAD_REQUEST';
    // "CODE:number" — seconds to wait or attempts left, for the hint on the screen
    const n = err.retryInSec ?? err.attemptsLeft;
    return new TRPCError({ code, message: n != null ? `${err.code}:${n}` : err.code });
  }
  if (err instanceof MailUnavailableError) return new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: err.message });
  return err;
}

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
          monthlyBudget: 1,
          remainingBudget: 1,
          onboardingCompleted: true,
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

      // "Connect Telegram" from Settings: start_param link_CODE attaches this Telegram
      // to the user who generated the code instead of creating a second account
      let linkResult: TelegramLinkResult | undefined;
      const startParam = new URLSearchParams(input.initData).get('start_param');
      if (startParam?.startsWith('link_')) {
        linkResult = await linkTelegramByCode(ctx.db, startParam.slice('link_'.length), platformId, input.initData, [`ip:${ctx.ip}`, `tg:${platformId}`]);
      }

      const userId = await signInTelegramUser(ctx.db, tgUser, input.initData);

      const accessToken = createAccessToken(userId);
      const refreshToken = createRefreshToken(userId);

      return { accessToken, refreshToken, userId, ...(linkResult ? { linkResult } : {}) };
    }),

  loginWithGoogle: publicProcedure
    .input(z.object({
      idToken: z.string().min(1),
      linkCode: z.string().length(6).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const googleUser = await verifyGoogleIdToken(input.idToken);
      if (!googleUser) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid Google token' });
      }

      // 0. If linkCode provided — attach Google to the TG user from that code
      if (input.linkCode) {
        const linkingCode = await linkCodeOrThrow(ctx, input.linkCode);
        if (!linkingCode) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid or expired link code' });
        }
        const user = await ctx.db.user.findUnique({ where: { id: linkingCode.userId } });
        if (!user || user.deletedAt) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
        }
        // Attach Google platform account (upsert in case already linked)
        await ctx.db.platformAccount.upsert({
          where: { platform_platformId: { platform: 'GOOGLE', platformId: googleUser.sub } },
          create: { userId: user.id, platform: 'GOOGLE', platformId: googleUser.sub, accessToken: input.idToken },
          update: { userId: user.id, accessToken: input.idToken },
        });
        if (googleUser.picture && !user.photoUrl) {
          await ctx.db.user.update({ where: { id: user.id }, data: { photoUrl: googleUser.picture } });
        }
        await ctx.db.linkingCode.delete({ where: { id: linkingCode.id } });
        const accessToken = createAccessToken(user.id);
        const refreshToken = createRefreshToken(user.id);
        return { accessToken, refreshToken, userId: user.id, isNew: false };
      }

      // 1–3. Known Google account, same proven e-mail, or a new person (SO-21)
      let userId: string;
      let isNew: boolean;
      try {
        ({ userId, isNew } = await resolveExternalIdentity(ctx.db, {
          platform: 'GOOGLE',
          platformId: googleUser.sub,
          verifiedEmail: googleUser.email_verified ? googleUser.email : null,
          name: googleUser.name,
          photoUrl: googleUser.picture || null,
          accessToken: input.idToken,
        }));
      } catch (err) {
        if (err instanceof AccountExistsError) throw new TRPCError({ code: 'CONFLICT', message: err.message });
        throw err;
      }

      const accessToken = createAccessToken(userId);
      const refreshToken = createRefreshToken(userId);

      return { accessToken, refreshToken, userId, isNew };
    }),

  /** Which sign-in methods this server can offer right now: a disabled one is hidden, not broken (SO-21). */
  methods: publicProcedure.query(() => ({
    google: !!process.env.GOOGLE_CLIENT_ID,
    apple: !!process.env.APPLE_SERVICE_ID,
    email: isMailConfigured(),
    telegramWidget: isTelegramWidgetEnabled(),
    telegramBot: process.env.VITE_TELEGRAM_BOT_USERNAME || 'socialorganizer_bot',
  })),

  /** Sends a one-time code. Same answer for registered and unknown addresses. */
  requestEmailCode: publicProcedure
    .input(z.object({ email: z.string().trim().email().max(254), lang: z.string().max(10).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await requestEmailCode(ctx.db, input.email, input.lang);
      } catch (err) {
        throw toEmailCodeTrpcError(err);
      }
    }),

  /** Checks the code: the proven address signs in to its account or creates one. */
  verifyEmailCode: publicProcedure
    .input(z.object({ email: z.string().trim().email().max(254), code: z.string().regex(/^\d{6}$/) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { userId, isNew } = await verifyEmailCode(ctx.db, input.email, input.code);
        return { accessToken: createAccessToken(userId), refreshToken: createRefreshToken(userId), userId, isNew };
      } catch (err) {
        throw toEmailCodeTrpcError(err);
      }
    }),

  /** Telegram sign-in on the website (Login Widget), checked on the server. */
  loginWithTelegramWidget: publicProcedure
    .input(z.object({
      id: z.number().int().positive(),
      first_name: z.string().max(256),
      last_name: z.string().max(256).optional(),
      username: z.string().max(64).optional(),
      photo_url: z.string().url().max(1024).optional(),
      auth_date: z.number().int(),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTelegramWidgetEnabled()) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'TELEGRAM_WIDGET_DISABLED' });
      const tgUser = validateTelegramWidget(input);
      if (!tgUser) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid Telegram login data' });
      const userId = await signInTelegramUser(ctx.db, tgUser, `widget:${input.auth_date}`);
      return { accessToken: createAccessToken(userId), refreshToken: createRefreshToken(userId), userId };
    }),

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      const payload = verifyToken(input.refreshToken, 'refresh');
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
      console.log(`[link-code] issued for user ${ctx.userId} from ip:${ctx.ip}`);
      return { code, expiresAt };
    }),

  /** Login on a new device using a 6-digit link code generated in Settings */
  loginWithLinkCode: publicProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const linkingCode = await linkCodeOrThrow(ctx, input.code);
      if (!linkingCode) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid or expired code' });
      }

      // Check the user still exists
      const user = await ctx.db.user.findUnique({ where: { id: linkingCode.userId } });
      if (!user || user.deletedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      await ctx.db.linkingCode.delete({ where: { id: linkingCode.id } });

      const accessToken = createAccessToken(user.id);
      const refreshToken = createRefreshToken(user.id);

      return { accessToken, refreshToken, userId: user.id };
    }),

  /** Link code + set email/password for TG users migrating to mobile app */
  claimWithLinkCode: publicProcedure
    .input(z.object({
      code: z.string().length(6),
      email: z.string().email(),
      password: z.string().min(6),
    }))
    .mutation(async ({ ctx, input }) => {
      const linkingCode = await linkCodeOrThrow(ctx, input.code);
      if (!linkingCode) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid or expired code' });
      }

      const user = await ctx.db.user.findUnique({ where: { id: linkingCode.userId } });
      if (!user || user.deletedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      const emailLower = input.email.toLowerCase();
      const existingEmail = await ctx.db.user.findUnique({ where: { email: emailLower } });
      if (existingEmail && existingEmail.id !== user.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      await ctx.db.user.update({
        where: { id: user.id },
        data: { email: emailLower, passwordHash },
      });

      await ctx.db.linkingCode.delete({ where: { id: linkingCode.id } });

      const accessToken = createAccessToken(user.id);
      const refreshToken = createRefreshToken(user.id);

      return { accessToken, refreshToken, userId: user.id };
    }),
});
