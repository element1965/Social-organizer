import { TELEGRAM_BOT_USERNAME } from '../deployment.js';
import { createUserWithReferralSlug } from '../services/referral-slug.service.js';
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, authAttemptProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import {
  verifyToken,
  generateLinkingCode,
  tokenIssuedMs,
  issuedBeforeEmailProof,
} from '../services/auth.service.js';
import { issueSignInTokens, issueTokensIf } from '../services/session.service.js';
import { validateTelegramInitData, validateTelegramWidget, isTelegramWidgetEnabled, telegramBotId, type TelegramUserData } from '../services/telegram.service.js';
import { applyBotStartInvite } from '../services/invite-fallback.service.js';
import { claimLinkingCode, LinkCodeRateLimitError } from '../services/link-code.service.js';
import type { Context } from '../context.js';
import { isEmptyAccount, linkTelegramByCode, mergeEmptyAccountInto, type TelegramLinkResult } from '../services/telegram-link.service.js';
import { verifyGoogleIdToken } from '../services/google.service.js';
import { resolveExternalIdentity, AccountExistsError } from '../services/identity.service.js';
import { requestEmailCode, verifyEmailCode, EmailCodeError } from '../services/email-code.service.js';
import { isMailConfigured, MailUnavailableError } from '../services/mail.service.js';
import { campaignFrom, type Campaign, DEFAULT_INTENTION_AMOUNT, LINKING_CODE_TTL_MINUTES } from '@so/shared';
import { restoreMutedAccount } from '../services/account-restore.service.js';
import { invalidateGraph } from '../services/graph-cache.service.js';

/**
 * Link-code redemption for tRPC callers: limited per IP, 429 when over the limit (SO-14). The code is spent
 * here, before the caller writes anything (SEC-4); null when it is wrong, expired or already used.
 */
async function linkCodeOrThrow(ctx: { db: Context['db']; ip: string }, code: string) {
  try {
    return await claimLinkingCode(ctx.db, code, [`ip:${ctx.ip}`]);
  } catch (err) {
    if (err instanceof LinkCodeRateLimitError) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: err.message });
    }
    throw err;
  }
}

/**
 * Find or create the user behind a verified Telegram identity (Mini App initData or the
 * web Login Widget) and refresh the profile photo and @username contact. Returns the userId and whether the
 * account was created just now (the client starts the first run for a new one, as for the other sign-ins).
 */
async function signInTelegramUser(
  db: Context['db'],
  tgUser: TelegramUserData,
  platformToken: string,
  campaign?: Campaign,
): Promise<{ userId: string; isNew: boolean }> {
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
  let isNew = false;

  if (platformAccount) {
    userId = platformAccount.userId;
    if (platformAccount.user.deletedAt) {
      // Muted by the bot (it kept the connections): signing in again brings the account back
      const tgName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
      if (await restoreMutedAccount(db, userId, { name: tgName, photoUrl: tgUser.photo_url })) {
        platformAccount.user.photoUrl = null;
      }
    }
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
    if (orphanedAccounts.length > 0) invalidateGraph(orphanedAccounts.map((oa) => oa.userId));

    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || `User_${platformId}`;
    const lang = tgUser.language_code?.slice(0, 2) || 'en';
    const user = await createUserWithReferralSlug(db, {
      name,
      photoUrl: tgUser.photo_url || null,
      language: lang,
      monthlyBudget: DEFAULT_INTENTION_AMOUNT,
      remainingBudget: DEFAULT_INTENTION_AMOUNT,
      onboardingCompleted: true,
      platformAccounts: {
        create: {
          platform: 'TELEGRAM',
          platformId,
          accessToken: platformToken,
        },
      },
    }, campaign);
    userId = user.id;
    isNew = true;
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
  return { userId, isNew };
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
  /**
   * Retired: an e-mail typed at password sign-up was never proven, so it could reserve someone else's address
   * (SEC-1). No client calls it any more (accounts are created by e-mail code, Google, Apple or Telegram);
   * the procedure stays so an old caller gets a clear refusal instead of NOT_FOUND.
   */
  registerWithEmail: authAttemptProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(6),
      name: z.string().min(1).optional(),
      campaign: z.unknown().optional(),
    }))
    .mutation(() => {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'PASSWORD_SIGNUP_RETIRED: sign in with a code sent to your e-mail' });
    }),

  loginWithEmail: authAttemptProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: input.email.toLowerCase() },
        omit: { passwordHash: false },
      });

      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      }

      const comparedHash = user.passwordHash;
      const validPassword = await bcrypt.compare(input.password, comparedHash);
      if (!validPassword) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      }

      // The compare takes a while: a first mailbox proof may have ended this password meanwhile (SEC-1).
      // Tokens come only if the stored hash is still the one that was compared, checked under the row lock.
      const tokens = await issueTokensIf(ctx.db, user.id, (row) => row.passwordHash === comparedHash);
      if (!tokens) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      }

      return { ...tokens, userId: user.id };
    }),

  loginWithTelegram: publicProcedure
    .input(z.object({
      initData: z.string().min(1),
      campaign: z.unknown().optional(),
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

      const { userId, isNew } = await signInTelegramUser(ctx.db, tgUser, input.initData, campaignFrom(input.campaign));

      const { accessToken, refreshToken } = await issueSignInTokens(ctx.db, userId);

      return { accessToken, refreshToken, userId, isNew, ...(linkResult ? { linkResult } : {}) };
    }),

  loginWithGoogle: publicProcedure
    .input(z.object({
      idToken: z.string().min(1),
      campaign: z.unknown().optional(),
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
        // This Google already made its own empty account: fold it in, so the person keeps one account
        const googleAccount = await ctx.db.platformAccount.findUnique({
          where: { platform_platformId: { platform: 'GOOGLE', platformId: googleUser.sub } },
          select: { userId: true },
        });
        if (googleAccount && googleAccount.userId !== user.id && await isEmptyAccount(ctx.db, googleAccount.userId)) {
          await mergeEmptyAccountInto(ctx.db, googleAccount.userId, user.id);
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
        const { accessToken, refreshToken } = await issueSignInTokens(ctx.db, user.id);
        return { accessToken, refreshToken, userId: user.id, isNew: false };
      }

      // 1–3. Known Google account, same proven e-mail, or a new person (SO-21)
      let userId: string;
      let isNew: boolean;
      try {
        ({ userId, isNew } = await resolveExternalIdentity(ctx.db, {
          platform: 'GOOGLE',
          platformId: googleUser.sub,
          campaign: campaignFrom(input.campaign),
          verifiedEmail: googleUser.email_verified ? googleUser.email : null,
          name: googleUser.name,
          photoUrl: googleUser.picture || null,
          accessToken: input.idToken,
        }));
      } catch (err) {
        if (err instanceof AccountExistsError) throw new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
        throw err;
      }

      const { accessToken, refreshToken } = await issueSignInTokens(ctx.db, userId);

      return { accessToken, refreshToken, userId, isNew };
    }),

  /** Which sign-in methods this server can offer right now: a disabled one is hidden, not broken (SO-21). */
  methods: publicProcedure.query(() => ({
    google: !!process.env.GOOGLE_CLIENT_ID,
    apple: !!process.env.APPLE_SERVICE_ID,
    email: isMailConfigured(),
    telegramWidget: isTelegramWidgetEnabled(),
    telegramBot: TELEGRAM_BOT_USERNAME,
    // The bot's public numeric id (the part of the token before ":", not the secret). The site's own Telegram
    // button opens Telegram's login popup with it, so the page never swaps in Telegram's smaller widget.
    telegramBotId: isTelegramWidgetEnabled() ? telegramBotId() : null,
  })),

  /** Sends a one-time code. Same answer for registered and unknown addresses. */
  requestEmailCode: authAttemptProcedure
    .input(z.object({ email: z.string().trim().email().max(254), lang: z.string().max(10).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await requestEmailCode(ctx.db, input.email, input.lang);
      } catch (err) {
        throw toEmailCodeTrpcError(err);
      }
    }),

  /** Checks the code: the proven address signs in to its account or creates one. */
  verifyEmailCode: authAttemptProcedure
    .input(z.object({ email: z.string().trim().email().max(254), code: z.string().regex(/^\d{6}$/), campaign: z.unknown().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { userId, isNew } = await verifyEmailCode(ctx.db, input.email, input.code, campaignFrom(input.campaign));
        return { ...(await issueSignInTokens(ctx.db, userId)), userId, isNew };
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
      campaign: z.unknown().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTelegramWidgetEnabled()) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'TELEGRAM_WIDGET_DISABLED' });
      const { campaign, ...signedData } = input;
      const tgUser = validateTelegramWidget(signedData);
      if (!tgUser) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid Telegram login data' });
      const { userId, isNew } = await signInTelegramUser(ctx.db, tgUser, `widget:${input.auth_date}`, campaignFrom(campaign));
      return { ...(await issueSignInTokens(ctx.db, userId)), userId, isNew };
    }),

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const payload = verifyToken(input.refreshToken, 'refresh');
      if (!payload) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid refresh token' });
      }
      // A deleted account gets no new tokens, and neither does a session from before the first mailbox proof
      // (SEC-1); checked under the row lock, so a proof running at the same moment cannot be overtaken
      const issuedMs = tokenIssuedMs(payload);
      const tokens = await issueTokensIf(ctx.db, payload.sub, (row) =>
        !row.deletedAt && !issuedBeforeEmailProof(issuedMs, row.emailVerifiedAt));
      if (!tokens) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid refresh token' });
      }
      return tokens;
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
  loginWithLinkCode: authAttemptProcedure
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

      const { accessToken, refreshToken } = await issueSignInTokens(ctx.db, user.id);

      return { accessToken, refreshToken, userId: user.id };
    }),

  /**
   * Retired: it set an unproven e-mail and a password on an account (SEC-1). No client calls it any more;
   * the e-mail sign-in is the code flow, which proves the address. The procedure stays so an old caller gets a clear refusal instead of NOT_FOUND.
   */
  claimWithLinkCode: authAttemptProcedure
    .input(z.object({
      code: z.string().length(6),
      email: z.string().email(),
      password: z.string().min(6),
    }))
    .mutation(() => {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'CLAIM_RETIRED: sign in with a code sent to your e-mail' });
    }),
});
