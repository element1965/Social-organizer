import { createHash } from 'node:crypto';
import { tgEscape } from './tg-html.js';
import { getDb } from '@so/db';
import { translateWithCache } from './translate.service.js';
import { isRetiredChainMessage } from './mvp-scope.js';
import { touchTelegramUser } from './activity.service.js';
import { networkReach } from './network.service.js';
import { invalidateGraph } from './graph-cache.service.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

/** Counter + info for users removed during a broadcast (blocked bot / deactivated) */
export const blockedCounter = {
  count: 0,
  removed: [] as RemovedUserInfo[],
  reset() { this.count = 0; this.removed = []; },
};

export interface RemovedUserInfo {
  name: string;
  platformId: string;
  userId: string;
  contacts: Array<{ type: string; value: string }>;
}

/** Remove a user who blocked the bot.
 *  If the user has confirmed connections or invitees — soft delete (mute) to keep their network intact (SO-15).
 *  Otherwise — hard delete with full cleanup (no traces left).
 *  Returns info about the removed user (for logging purposes). */
export async function removeBlockedUser(chatId: string | number): Promise<RemovedUserInfo | null> {
  const platformId = String(chatId);
  try {
    const db = getDb();
    const account = await db.platformAccount.findFirst({
      where: { platform: 'TELEGRAM', platformId },
      select: { userId: true },
    });
    if (account?.userId) {
      const userId = account.userId;
      const { countConnections } = await import('./connection-request.service.js');
      // Fetch user info before deletion for logging
      const [user, contacts, usedInviteCount, connectionCount] = await Promise.all([
        db.user.findUnique({ where: { id: userId }, select: { name: true } }),
        db.userContact.findMany({ where: { userId }, select: { type: true, value: true } }),
        db.inviteLink.count({ where: { inviterId: userId, usedById: { not: null } } }),
        countConnections(db, userId),
      ]);

      // Same scenario rule as user.delete (SO-15): confirmed connections or invitees → soft delete
      if (usedInviteCount > 0 || connectionCount > 0) {
        // Has connections or invitees — soft delete (mute) so their network stays intact
        await db.user.update({
          where: { id: userId },
          data: {
            deletedAt: new Date(),
            name: 'Deleted user',
            bio: null,
            phone: null,
            photoUrl: null,
          },
        });
        console.log(`[TG Bot] Soft-deleted (muted) user ${platformId} (${user?.name}, userId: ${userId}) — ${connectionCount} connections, ${usedInviteCount} invitees`);
      } else {
        // No invitees — full delete with no traces
        await db.inviteLink.updateMany({
          where: { usedById: userId },
          data: { usedById: null, usedAt: null },
        });
        await db.botStart.deleteMany({ where: { chatId: platformId } });
        await db.user.delete({ where: { id: userId } });
        console.log(`[TG Bot] Hard-deleted blocked user ${platformId} (${user?.name}, userId: ${userId})`);
      }

      // The graph re-reads this one person instead of the whole table
      invalidateGraph([userId]);

      blockedCounter.count += 1;
      const info: RemovedUserInfo = {
        name: user?.name ?? 'Unknown',
        platformId,
        userId,
        contacts,
      };
      blockedCounter.removed.push(info);
      return info;
    } else {
      // No user found — just clean up orphaned records
      const deleted = await db.platformAccount.deleteMany({
        where: { platform: 'TELEGRAM', platformId },
      });
      await db.botStart.deleteMany({ where: { chatId: platformId } });
      if (deleted.count > 0) blockedCounter.count += deleted.count;
      console.log(`[TG Bot] Removed orphaned platform account & botStart ${platformId}`);
      return null;
    }
  } catch (err) {
    console.error(`[TG Bot] Failed to remove blocked user ${platformId}:`, err);
    return null;
  }
}

/** Check if the bot can reach a chat (user hasn't blocked the bot).
 *  Returns true if chat is accessible, false if blocked/deactivated/not found. */
export async function checkChatExists(chatId: string | number): Promise<boolean> {
  // No token = misconfiguration, not a blocked user: never treat it as "unreachable".
  if (!TELEGRAM_BOT_TOKEN) return true;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId }),
    });
    const json = (await res.json()) as TgApiResponse;
    if (json.ok) return true;
    // Only 403 (bot was blocked / user is deactivated) means the user is gone. "chat not found" (400)
    // also comes for people who use the app but never pressed Start in the bot, and 429 / 5xx are
    // transient: since 26.09.2026 the midnight run deleted ~30 active users this way.
    if (isBlockedError(res.status, json.description)) return false;
    console.warn(`[TG Bot] getChat ${chatId} failed (${res.status}: ${json.description ?? 'no description'}) — treating as reachable`);
    return true;
  } catch {
    // Network error — assume chat exists (don't delete on transient failures)
    return true;
  }
}

/**
 * Only an explicit "blocked" or "deactivated" answer means the person is gone. Telegram also answers
 * 403 "bot can't initiate conversation with a user" and 400 "chat not found" to people who signed in
 * (Login Widget, a mini app opened from a link) but never pressed Start in the bot: they are active
 * users the bot simply cannot write to first. On 11.11.2026 a newcomer was muted this way by the
 * first notification after their invite was confirmed.
 */
function isBlockedError(status: number, description?: string): boolean {
  if (status !== 403 || !description) return false;
  const d = description.toLowerCase();
  return d.includes('bot was blocked') || d.includes('user is deactivated');
}

/** Why a send failed, for the log only: the status and Telegram's short description (never the text). */
function logSendFailure(chatId: string | number, status: number, description?: string) {
  console.warn(`[TG] send to ${chatId} failed (${status}: ${description ?? 'no description'})`);
}

export interface TgReplyMarkup {
  inline_keyboard: Array<Array<{ text: string; url?: string; web_app?: { url: string }; callback_data?: string }>>;
}

interface TgApiResponse {
  ok: boolean;
  description?: string;
  result?: unknown;
  parameters?: { retry_after?: number };
}

interface TgUpdate {
  message?: {
    message_id?: number;
    chat: { id: number };
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string }>;
    video?: { file_id: string };
    document?: { file_id: string; file_name?: string };
    voice?: { file_id: string };
    sticker?: { file_id: string };
    from?: {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
  };
  callback_query?: {
    id: string;
    from: { id: number; language_code?: string };
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}

export const SUPPORT_CHAT_ID = -4946509857;

/** Track a /start press — save chatId for follow-up if user never opens the app */
async function trackBotStart(chatId: string, name: string, lang: string, inviteToken?: string, username?: string): Promise<void> {
  const db = getDb();
  // Skip if user already has an account
  const existing = await db.platformAccount.findFirst({
    where: { platform: 'TELEGRAM', platformId: chatId },
    select: { id: true },
  });
  if (existing) return;

  await db.botStart.upsert({
    where: { chatId },
    create: { chatId, name: name || null, username: username || null, language: lang, inviteToken: inviteToken || null },
    update: { name: name || undefined, username: username || undefined, language: lang, inviteToken: inviteToken || undefined },
  });
}

/**
 * Find the inviter's Telegram chatId and name from an invite token.
 * Token can be: InviteLink hex token, userId, or referralSlug.
 */
export async function findInviterTg(token: string): Promise<{ chatId: string; name: string } | null> {
  const db = getDb();
  const select = { name: true, platformAccounts: { where: { platform: 'TELEGRAM' as const }, select: { platformId: true } } };

  // 1. Try InviteLink
  const invite = await db.inviteLink.findUnique({
    where: { token },
    select: { inviter: { select } },
  });
  if (invite?.inviter?.platformAccounts[0]) {
    return { chatId: invite.inviter.platformAccounts[0].platformId, name: invite.inviter.name };
  }

  // 2. Try userId
  let user = await db.user.findUnique({ where: { id: token }, select });
  if (user?.platformAccounts[0]) {
    return { chatId: user.platformAccounts[0].platformId, name: user.name };
  }

  // 3. Try referralSlug
  user = await db.user.findUnique({ where: { referralSlug: token.toLowerCase() }, select });
  if (user?.platformAccounts[0]) {
    return { chatId: user.platformAccounts[0].platformId, name: user.name };
  }

  return null;
}

/** Inviter notification messages when their invitee started bot but never opened the app */
export const INVITER_NOTIFY_MESSAGES = [
  {
    level: 0,
    text: '👋 {inviteeName}{inviteeContact} запустил бот по вашему приглашению, но ещё не открыл приложение. Подскажите — нужно нажать кнопку «Open» внизу чата с ботом.',
  },
  {
    level: 1,
    text: '⏰ Прошли сутки, а {inviteeName}{inviteeContact} так и не открыл приложение. Возможно, нужна ваша помощь — напишите или позвоните, помогите разобраться с входом!',
  },
] as const;

/** Reminder messages for users who pressed /start but never opened the app */
export const BOT_START_REMINDERS = [
  {
    level: 1,
    text: '👋 Ты ещё не открыл приложение. Нажми кнопку — это займёт минуту!',
    buttonText: 'Открыть приложение',
  },
  {
    level: 2,
    text: '🤝 {inviterName} приглашает тебя в свою сеть. Открой приложение, регистрация займёт минуту.',
    buttonText: 'Присоединиться',
  },
  {
    level: 3,
    text: '🔔 Последнее напоминание: твоё приглашение от {inviterName} ещё действует. Нажми кнопку, чтобы присоединиться.',
    buttonText: 'Открыть',
  },
] as const;

/** Onboarding reminder messages (Russian base text — translated per user language by worker) */
export const ONBOARDING_REMINDERS = [
  {
    level: 1,
    text: '👋 Почти готово! Добавь один контакт — и ты в сети.',
    buttonText: 'Открыть приложение',
  },
  {
    level: 2,
    text: '🤝 {inviterName} ждёт тебя. Заверши профиль — это займёт 1 минуту.',
    buttonText: 'Завершить профиль',
  },
  {
    level: 3,
    text: '🔗 Твоё место в сети {inviterName} всё ещё открыто. Не упусти!',
    buttonText: 'Присоединиться',
  },
] as const;

/**
 * Low-level wrapper: send a message via Telegram Bot API with 429 retry.
 * By default a "blocked / deactivated" answer removes the user (removeBlockedUser).
 * `keepOnBlocked` turns that off: the send just fails (used by the inactivity notices,
 * which must never delete anyone by themselves).
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: TgReplyMarkup,
  opts: { keepOnBlocked?: boolean } = {},
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const doSend = async (): Promise<boolean> => {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as TgApiResponse;

    if (json.ok) return true;

    // User blocked the bot or account deactivated — remove from DB
    if (!json.ok && (res.status === 403 || res.status === 400)) logSendFailure(chatId, res.status, json.description);
    if (isBlockedError(res.status, json.description)) {
      if (!opts.keepOnBlocked) await removeBlockedUser(chatId);
      return false;
    }

    // Handle rate-limit: wait retry_after seconds and retry once
    if (res.status === 429 && json.parameters?.retry_after) {
      const waitMs = json.parameters.retry_after * 1000;
      console.warn(`[TG Bot] 429 rate limited, waiting ${json.parameters.retry_after}s`);
      await new Promise((r) => setTimeout(r, waitMs));
      const retryRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const retryJson = (await retryRes.json()) as TgApiResponse;
      return retryJson.ok;
    }

    console.error(`[TG Bot] sendMessage failed: ${json.description}`);
    return false;
  };

  return doSend();
}

/** Forward a message from one chat to another */
async function forwardTelegramMessage(
  fromChatId: string | number,
  toChatId: string | number,
  messageId: number,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/forwardMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: toChatId,
        from_chat_id: fromChatId,
        message_id: messageId,
      }),
    });
    const json = (await res.json()) as TgApiResponse;
    if (!json.ok) {
      console.error(`[TG Bot] forwardMessage failed: ${json.description}`);
    }
    return json.ok;
  } catch (err) {
    console.error('[TG Bot] forwardMessage error:', err);
    return false;
  }
}

/** Send a photo via Telegram Bot API */
export async function sendTelegramPhoto(
  chatId: string | number,
  photoUrl: string,
  caption?: string,
  replyMarkup?: TgReplyMarkup,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    photo: photoUrl,
    parse_mode: 'HTML',
  };
  if (caption) body.caption = caption;
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as TgApiResponse;

  if (json.ok) return true;

  if (!json.ok && (res.status === 403 || res.status === 400)) logSendFailure(chatId, res.status, json.description);

  if (isBlockedError(res.status, json.description)) {
    await removeBlockedUser(chatId);
    return false;
  }

  // Handle rate-limit
  if (res.status === 429 && json.parameters?.retry_after) {
    const waitMs = json.parameters.retry_after * 1000;
    console.warn(`[TG Bot] 429 rate limited, waiting ${json.parameters.retry_after}s`);
    await new Promise((r) => setTimeout(r, waitMs));
    const retryRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const retryJson = (await retryRes.json()) as TgApiResponse;
    return retryJson.ok;
  }

  console.error(`[TG Bot] sendPhoto failed: ${json.description}`);
  return false;
}

/** Check if URL is a video hosting page (YouTube, Vimeo, etc.) rather than a direct video file */
function isVideoHostingUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host.includes('youtube.com') || host.includes('youtu.be')
      || host.includes('vimeo.com') || host.includes('dailymotion.com')
      || host.includes('tiktok.com') || host.includes('rutube.ru');
  } catch {
    return false;
  }
}

/** Send a video via Telegram Bot API.
 *  For video hosting URLs (YouTube, Vimeo, etc.) falls back to sendMessage
 *  which renders a rich link preview with embedded player. */
export async function sendTelegramVideo(
  chatId: string | number,
  videoUrl: string,
  caption?: string,
  replyMarkup?: TgReplyMarkup,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  // Video hosting URLs don't work with sendVideo (it expects a direct file).
  // Use sendMessage instead — Telegram auto-generates a rich video preview.
  if (isVideoHostingUrl(videoUrl)) {
    const text = caption ? `${caption}\n\n${videoUrl}` : videoUrl;
    return sendTelegramMessage(chatId, text, replyMarkup);
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    video: videoUrl,
    parse_mode: 'HTML',
    supports_streaming: true,
  };
  if (caption) body.caption = caption;
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as TgApiResponse;

  if (json.ok) return true;

  if (!json.ok && (res.status === 403 || res.status === 400)) logSendFailure(chatId, res.status, json.description);

  if (isBlockedError(res.status, json.description)) {
    await removeBlockedUser(chatId);
    return false;
  }

  // Handle rate-limit
  if (res.status === 429 && json.parameters?.retry_after) {
    const waitMs = json.parameters.retry_after * 1000;
    console.warn(`[TG Bot] 429 rate limited, waiting ${json.parameters.retry_after}s`);
    await new Promise((r) => setTimeout(r, waitMs));
    const retryRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const retryJson = (await retryRes.json()) as TgApiResponse;
    return retryJson.ok;
  }

  console.error(`[TG Bot] sendVideo failed: ${json.description}`);
  return false;
}

/** Send a document/file via Telegram Bot API using file_id or URL */
export async function sendTelegramDocument(
  chatId: string | number,
  document: string,
  caption?: string,
  replyMarkup?: TgReplyMarkup,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    document,
    parse_mode: 'HTML',
  };
  if (caption) body.caption = caption;
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as TgApiResponse;
  if (json.ok) return true;
  if (!json.ok && (res.status === 403 || res.status === 400)) logSendFailure(chatId, res.status, json.description);
  if (isBlockedError(res.status, json.description)) {
    await removeBlockedUser(chatId);
    return false;
  }
  console.error(`[TG Bot] sendDocument failed: ${json.description}`);
  return false;
}

/** Send a collection notification to a Telegram user with an inline "Open" button */
export async function sendCollectionNotificationTg(
  telegramId: string,
  creatorName: string,
  type: 'EMERGENCY' | 'REGULAR',
  amount: number | null,
  currency: string,
  collectionId: string,
): Promise<boolean> {
  const emoji = type === 'EMERGENCY' ? '🚨' : '📢';
  const typeLabel = type === 'EMERGENCY' ? 'one time' : 'every 28 days';

  const amountStr = amount != null ? `${amount} ${currency}` : 'open';
  const text = `${emoji} <b>New Need · ${typeLabel}</b>\n\nFrom: <b>${creatorName}</b>\nAmount: ${amountStr}\n\nSomeone in your network has reported a Need.`;

  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  const replyMarkup: TgReplyMarkup = {
    inline_keyboard: [[{ text: '📱 Open', web_app: { url: webAppLink } }]],
  };

  return sendTelegramMessage(telegramId, text, replyMarkup);
}

// Bot /start message translations for all 27 supported languages
const SITE = 'https://www.orginizer.com/';
interface BotLocale {
  invite: (name: string, inviterName: string, stats: InviteStats | null) => string;
  acceptBtn: string;
  welcome: (name: string) => string;
  openBtn: string;
}

/** Puts values into a template; a function replacer, so a "$" in a name is never read as a pattern */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function makeBotLocale(
  welcomeWord: string, // "welcome to" / "добро пожаловать в", lower-case first letter
  text: { invite: string; inviteNoStats: string; welcome: string },
  acceptBtn: string,
  openBtn: string,
  learnMore: string,
): BotLocale {
  const hello = (name: string) =>
    `👋 ${name ? name + ', ' + welcomeWord : welcomeWord.charAt(0).toUpperCase() + welcomeWord.slice(1)} <b>Social Organizer</b>!`;
  const more = `🌐 <a href="${SITE}">${learnMore}</a>`;
  return {
    invite: (name, inviterName, stats) => {
      const line = stats
        ? fill(text.invite, { inv: inviterName, p: groupDigits(stats.people), usd: `${groupDigits(stats.declaredUsd)} $` })
        : fill(text.inviteNoStats, { inv: inviterName });
      return `${hello(name)}\n\n${line}\n\n${more}`;
    },
    acceptBtn: `🤝 ${acceptBtn}`,
    welcome: (name) => `${hello(name)}\n\n${text.welcome}\n\n${more}`,
    openBtn: `📱 ${openBtn}`,
  };
}

/**
 * The inviter behind an invite token (InviteLink token, user id or referralSlug), with or without a Telegram
 * account: the invite message names them either way.
 */
async function findInviter(token: string): Promise<{ id: string; name: string } | null> {
  const db = getDb();
  const select = { id: true, name: true, deletedAt: true } as const;
  const invite = await db.inviteLink.findUnique({ where: { token }, select: { inviter: { select } } });
  const user =
    invite?.inviter
    ?? (await db.user.findUnique({ where: { id: token }, select }))
    ?? (await db.user.findUnique({ where: { referralSlug: token.toLowerCase() }, select }));
  return user && !user.deletedAt ? { id: user.id, name: user.name } : null;
}

export type InviteStats = { people: number; declaredUsd: number };

/**
 * The inviter's own network, counted exactly as their Profile shows it: the people in the visible rings 1–3
 * and their "Declared participation of the network" (networkReach). The old message summed every account in
 * the database, deleted ones included, with their monthlyBudget, so its numbers matched nothing in the app.
 */
async function inviterNetworkStats(userId: string): Promise<InviteStats | null> {
  const reach = await networkReach(getDb(), userId);
  return reach.visible > 0 ? { people: reach.visible, declaredUsd: reach.canHelpVisible } : null;
}

/** 10052 → "10 052" (thin space), the grouping the app uses */
export function groupDigits(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
}

const BOT_STRINGS: Record<string, BotLocale> = {
  en: makeBotLocale(
    "welcome to",
    {
      invite: "<b>{inv}</b> invites you to their network on Social Organizer.\nPeople in the network: {p}. Declared participation of the network: {usd}.",
      inviteNoStats: "<b>{inv}</b> invites you to their network on Social Organizer.",
      welcome: "A network of people you know in person. When one of you has a hard time, the others can share the load.",
    },
    "Accept Invitation", "Open App", "Learn more"),
  ru: makeBotLocale(
    "добро пожаловать в",
    {
      invite: "<b>{inv}</b> приглашает вас в свою сеть в Social Organizer.\nЛюдей в сети: {p}. Заявленное участие сети: {usd}.",
      inviteNoStats: "<b>{inv}</b> приглашает вас в свою сеть в Social Organizer.",
      welcome: "Сеть из людей, которых вы знаете лично. Когда кому-то из вас трудно, остальные могут разделить ношу.",
    },
    "Принять приглашение", "Открыть приложение", "Узнать больше"),
  uk: makeBotLocale(
    "ласкаво просимо до",
    {
      invite: "<b>{inv}</b> запрошує вас до своєї мережі в Social Organizer.\nЛюдей у мережі: {p}. Заявлена участь мережі: {usd}.",
      inviteNoStats: "<b>{inv}</b> запрошує вас до своєї мережі в Social Organizer.",
      welcome: "Мережа людей, яких ви знаєте особисто. Коли комусь із вас важко, решта можуть розділити ношу.",
    },
    "Прийняти запрошення", "Відкрити застосунок", "Дізнатися більше"),
  be: makeBotLocale(
    "вітаем у",
    {
      invite: "<b>{inv}</b> запрашае вас у сваю сетку ў Social Organizer.\nЛюдзей у сетцы: {p}. Заяўлены ўдзел сеткі: {usd}.",
      inviteNoStats: "<b>{inv}</b> запрашае вас у сваю сетку ў Social Organizer.",
      welcome: "Сетка людзей, якіх вы ведаеце асабіста. Калі камусьці з вас цяжка, астатнія могуць падзяліць цяжар.",
    },
    "Прыняць запрашэнне", "Адкрыць дадатак", "Даведацца больш"),
  es: makeBotLocale(
    "bienvenido a",
    {
      invite: "<b>{inv}</b> les invita a su red en Social Organizer.\nPersonas en la red: {p}. Participación declarada de la red: {usd}.",
      inviteNoStats: "<b>{inv}</b> les invita a su red en Social Organizer.",
      welcome: "Una red de personas que conoce en persona. Cuando a uno de ustedes le va mal, los demás pueden repartirse la carga.",
    },
    "Aceptar invitación", "Abrir app", "Saber más"),
  fr: makeBotLocale(
    "bienvenue sur",
    {
      invite: "<b>{inv}</b> vous invite dans son réseau sur Social Organizer.\nPersonnes dans le réseau: {p}. Participation déclarée du réseau: {usd}.",
      inviteNoStats: "<b>{inv}</b> vous invite dans son réseau sur Social Organizer.",
      welcome: "Un réseau de personnes que vous connaissez en personne. Quand l’un de vous traverse une période difficile, les autres peuvent l’aider à porter le poids.",
    },
    "Accepter l'invitation", "Ouvrir l'appli", "En savoir plus"),
  de: makeBotLocale(
    "willkommen bei",
    {
      invite: "<b>{inv}</b> lädt Sie in sein Netzwerk bei Social Organizer ein.\nMenschen im Netzwerk: {p}. Erklärte Beteiligung des Netzwerks: {usd}.",
      inviteNoStats: "<b>{inv}</b> lädt Sie in sein Netzwerk bei Social Organizer ein.",
      welcome: "Ein Netzwerk aus Menschen, die Sie persönlich kennen. Wenn es einem von Ihnen schlecht geht, können die anderen die Last mittragen.",
    },
    "Einladung annehmen", "App öffnen", "Mehr erfahren"),
  pt: makeBotLocale(
    "bem-vindo ao",
    {
      invite: "<b>{inv}</b> convida você para a rede dele no Social Organizer.\nPessoas na rede: {p}. Participação declarada da rede: {usd}.",
      inviteNoStats: "<b>{inv}</b> convida você para a rede dele no Social Organizer.",
      welcome: "Uma rede de pessoas que você conhece pessoalmente. Quando alguém do grupo passa por um aperto, os outros podem dividir o peso.",
    },
    "Aceitar convite", "Abrir app", "Saiba mais"),
  it: makeBotLocale(
    "benvenuto in",
    {
      invite: "<b>{inv}</b> ti invita nella sua rete su Social Organizer.\nPersone nella rete: {p}. Partecipazione dichiarata della rete: {usd}.",
      inviteNoStats: "<b>{inv}</b> ti invita nella sua rete su Social Organizer.",
      welcome: "Una rete di persone che conosci di persona. Quando uno di voi è in difficoltà, gli altri possono dividersi il peso.",
    },
    "Accetta invito", "Apri app", "Scopri di più"),
  pl: makeBotLocale(
    "witaj w",
    {
      invite: "<b>{inv}</b> zaprasza Cię do swojej sieci w Social Organizer.\nOsób w sieci: {p}. Zadeklarowany udział sieci: {usd}.",
      inviteNoStats: "<b>{inv}</b> zaprasza Cię do swojej sieci w Social Organizer.",
      welcome: "Sieć ludzi, których znasz osobiście. Gdy komuś z was jest ciężko, pozostali mogą pomóc udźwignąć ten ciężar.",
    },
    "Przyjmij zaproszenie", "Otwórz aplikację", "Dowiedz się więcej"),
  nl: makeBotLocale(
    "welkom bij",
    {
      invite: "<b>{inv}</b> nodigt je uit voor zijn netwerk op Social Organizer.\nMensen in het netwerk: {p}. Aangegeven deelname van het netwerk: {usd}.",
      inviteNoStats: "<b>{inv}</b> nodigt je uit voor zijn netwerk op Social Organizer.",
      welcome: "Een netwerk van mensen die je persoonlijk kent. Heeft iemand van jullie het moeilijk, dan kunnen de anderen de last delen.",
    },
    "Uitnodiging accepteren", "App openen", "Meer info"),
  cs: makeBotLocale(
    "vítej v",
    {
      invite: "<b>{inv}</b> vás zve do své sítě v Social Organizer.\nLidí v síti: {p}. Deklarovaná účast sítě: {usd}.",
      inviteNoStats: "<b>{inv}</b> vás zve do své sítě v Social Organizer.",
      welcome: "Síť lidí, které znáte osobně. Když je někomu z vás těžko, ostatní mu mohou pomoct unést břemeno.",
    },
    "Přijmout pozvánku", "Otevřít aplikaci", "Zjistit více"),
  ro: makeBotLocale(
    "bun venit la",
    {
      invite: "<b>{inv}</b> te invită în rețeaua lui pe Social Organizer.\nOameni în rețea: {p}. Participarea declarată a rețelei: {usd}.",
      inviteNoStats: "<b>{inv}</b> te invită în rețeaua lui pe Social Organizer.",
      welcome: "O rețea de oameni pe care îi cunoști personal. Când unuia dintre voi îi e greu, ceilalți pot duce greul împreună.",
    },
    "Acceptă invitația", "Deschide aplicația", "Află mai multe"),
  tr: makeBotLocale(
    "hoş geldin,",
    {
      invite: "<b>{inv}</b> sizi Social Organizer üzerindeki ağına davet ediyor.\nAğdaki kişi sayısı: {p}. Ağın beyan ettiği katılım: {usd}.",
      inviteNoStats: "<b>{inv}</b> sizi Social Organizer üzerindeki ağına davet ediyor.",
      welcome: "Yüz yüze tanıdığınız insanlardan oluşan bir ağ. Biriniz zor durumda kaldığında diğerleri yükü paylaşabilir.",
    },
    "Daveti kabul et", "Uygulamayı aç", "Daha fazla bilgi"),
  ar: makeBotLocale(
    "مرحباً بك في",
    {
      invite: "يدعوك <b>{inv}</b> إلى شبكته على Social Organizer.\nالأشخاص في الشبكة: {p}. المشاركة المعلنة للشبكة: {usd}.",
      inviteNoStats: "يدعوك <b>{inv}</b> إلى شبكته على Social Organizer.",
      welcome: "شبكة من أشخاص تعرفهم شخصيًا. عندما يمر أحدكم بوقت صعب، يتقاسم الباقون العبء.",
    },
    "قبول الدعوة", "فتح التطبيق", "اعرف المزيد"),
  he: makeBotLocale(
    "ברוך הבא ל",
    {
      invite: "הוזמנתם לרשת של <b>{inv}</b> ב-Social Organizer.\nאנשים ברשת: {p}. ההשתתפות המוצהרת של הרשת: {usd}.",
      inviteNoStats: "הוזמנתם לרשת של <b>{inv}</b> ב-Social Organizer.",
      welcome: "רשת של אנשים שאתם מכירים אישית. כשלאחד מכם קשה, האחרים יכולים לחלוק איתו בנטל.",
    },
    "קבל הזמנה", "פתח אפליקציה", "למידע נוסף"),
  hi: makeBotLocale(
    "में आपका स्वागत है,",
    {
      invite: "<b>{inv}</b> आपको Social Organizer पर अपने नेटवर्क में आमंत्रित करते हैं।\nनेटवर्क में लोग: {p}. नेटवर्क की घोषित भागीदारी: {usd}.",
      inviteNoStats: "<b>{inv}</b> आपको Social Organizer पर अपने नेटवर्क में आमंत्रित करते हैं।",
      welcome: "उन लोगों का नेटवर्क जिन्हें आप व्यक्तिगत रूप से जानते हैं। जब आप में से किसी पर मुश्किल आती है, बाकी लोग बोझ बाँट सकते हैं।",
    },
    "निमंत्रण स्वीकार करें", "ऐप खोलें", "और जानें"),
  zh: makeBotLocale(
    "欢迎来到",
    {
      invite: "<b>{inv}</b> 邀请你加入自己在 Social Organizer 上的网络。\n网络中的人数: {p}. 网络已表明的参与: {usd}.",
      inviteNoStats: "<b>{inv}</b> 邀请你加入自己在 Social Organizer 上的网络。",
      welcome: "由你亲自认识的人组成的网络。你们当中有人遇到困难时，其他人可以一起分担。",
    },
    "接受邀请", "打开应用", "了解更多"),
  ja: makeBotLocale(
    "へようこそ、",
    {
      invite: "<b>{inv}</b> さんが Social Organizer の自分のネットワークにあなたを招待しています。\nネットワークの人数: {p}. ネットワークの表明された参加: {usd}.",
      inviteNoStats: "<b>{inv}</b> さんが Social Organizer の自分のネットワークにあなたを招待しています。",
      welcome: "直接知っている人たちのネットワークです。誰かが困っているとき、ほかの人たちは負担を分け合えます。",
    },
    "招待を受ける", "アプリを開く", "詳細を見る"),
  ko: makeBotLocale(
    "에 오신 것을 환영합니다,",
    {
      invite: "<b>{inv}</b> 님이 Social Organizer의 네트워크에 초대했어요.\n네트워크 인원: {p}. 네트워크가 밝힌 참여: {usd}.",
      inviteNoStats: "<b>{inv}</b> 님이 Social Organizer의 네트워크에 초대했어요.",
      welcome: "직접 아는 사람들로 이루어진 네트워크예요. 누군가 어려울 때 다른 사람들이 짐을 나눠 질 수 있어요.",
    },
    "초대 수락", "앱 열기", "자세히 알아보기"),
  th: makeBotLocale(
    "ยินดีต้อนรับสู่",
    {
      invite: "<b>{inv}</b> เชิญคุณเข้าร่วมเครือข่ายของเขาบน Social Organizer\nจำนวนคนในเครือข่าย: {p}. การมีส่วนร่วมที่เครือข่ายแจ้งไว้: {usd}.",
      inviteNoStats: "<b>{inv}</b> เชิญคุณเข้าร่วมเครือข่ายของเขาบน Social Organizer",
      welcome: "เครือข่ายของคนที่คุณรู้จักตัวต่อตัว เมื่อใครสักคนในกลุ่มลำบาก คนอื่นก็ช่วยกันแบกได้",
    },
    "รับคำเชิญ", "เปิดแอป", "เรียนรู้เพิ่มเติม"),
  vi: makeBotLocale(
    "chào mừng đến với",
    {
      invite: "<b>{inv}</b> mời bạn vào mạng lưới của họ trên Social Organizer.\nSố người trong mạng lưới: {p}. Mức tham gia đã nêu của mạng lưới: {usd}.",
      inviteNoStats: "<b>{inv}</b> mời bạn vào mạng lưới của họ trên Social Organizer.",
      welcome: "Một mạng lưới những người bạn quen trực tiếp. Khi một người trong các bạn gặp khó khăn, những người còn lại có thể san sẻ gánh nặng.",
    },
    "Chấp nhận lời mời", "Mở ứng dụng", "Tìm hiểu thêm"),
  id: makeBotLocale(
    "selamat datang di",
    {
      invite: "<b>{inv}</b> mengundang Anda ke jaringannya di Social Organizer.\nOrang dalam jaringan: {p}. Partisipasi jaringan yang dinyatakan: {usd}.",
      inviteNoStats: "<b>{inv}</b> mengundang Anda ke jaringannya di Social Organizer.",
      welcome: "Jaringan orang yang Anda kenal secara pribadi. Kalau salah satu dari Anda sedang kesulitan, yang lain bisa ikut menanggung bebannya.",
    },
    "Terima undangan", "Buka aplikasi", "Pelajari lebih lanjut"),
  sv: makeBotLocale(
    "välkommen till",
    {
      invite: "<b>{inv}</b> bjuder in dig till sitt nätverk på Social Organizer.\nPersoner i nätverket: {p}. Nätverkets angivna deltagande: {usd}.",
      inviteNoStats: "<b>{inv}</b> bjuder in dig till sitt nätverk på Social Organizer.",
      welcome: "Ett nätverk av människor du känner personligen. När någon av er har det svårt kan de andra dela bördan.",
    },
    "Acceptera inbjudan", "Öppna appen", "Läs mer"),
  da: makeBotLocale(
    "velkommen til",
    {
      invite: "<b>{inv}</b> inviterer dig til sit netværk på Social Organizer.\nMennesker i netværket: {p}. Netværkets erklærede deltagelse: {usd}.",
      inviteNoStats: "<b>{inv}</b> inviterer dig til sit netværk på Social Organizer.",
      welcome: "Et netværk af mennesker, du kender personligt. Når en af jer har det svært, kan de andre dele byrden.",
    },
    "Accepter invitation", "Åbn appen", "Læs mere"),
  fi: makeBotLocale(
    "tervetuloa palveluun",
    {
      invite: "<b>{inv}</b> kutsuu sinut verkostoonsa Social Organizerissa.\nIhmisiä verkostossa: {p}. Verkoston ilmoitettu osallistuminen: {usd}.",
      inviteNoStats: "<b>{inv}</b> kutsuu sinut verkostoonsa Social Organizerissa.",
      welcome: "Verkosto ihmisistä, jotka tunnet henkilökohtaisesti. Kun yhdellä teistä on vaikeaa, muut voivat jakaa taakan.",
    },
    "Hyväksy kutsu", "Avaa sovellus", "Lue lisää"),
  no: makeBotLocale(
    "velkommen til",
    {
      invite: "<b>{inv}</b> inviterer deg til nettverket sitt på Social Organizer.\nPersoner i nettverket: {p}. Nettverkets oppgitte deltakelse: {usd}.",
      inviteNoStats: "<b>{inv}</b> inviterer deg til nettverket sitt på Social Organizer.",
      welcome: "Et nettverk av folk du kjenner personlig. Når en av dere har det vanskelig, kan de andre dele byrden.",
    },
    "Aksepter invitasjon", "Åpne appen", "Les mer"),
  sr: makeBotLocale(
    "добродошли у",
    {
      invite: "<b>{inv}</b> вас позива у своју мрежу у Social Organizer.\nЉуди у мрежи: {p}. Изјављено учешће мреже: {usd}.",
      inviteNoStats: "<b>{inv}</b> вас позива у своју мрежу у Social Organizer.",
      welcome: "Мрежа људи које лично познајете. Када је неком од вас тешко, остали могу да поделе терет.",
    },
    "Прихвати позив", "Отвори апликацију", "Сазнајте више"),
};

/** "More..." button text for all supported languages */
export const MORE_BUTTON: Record<string, string> = {
  en: 'More...', ru: 'Ещё...', uk: 'Ще...', be: 'Яшчэ...',
  es: 'Más...', fr: 'Suite...', de: 'Mehr...', pt: 'Mais...',
  it: 'Altro...', pl: 'Więcej...', nl: 'Meer...', cs: 'Více...',
  ro: 'Mai mult...', tr: 'Devamı...', ar: 'المزيد...', he: 'עוד...',
  hi: 'और...', zh: '更多...', ja: '続き...', ko: '더보기...',
  th: 'เพิ่มเติม...', vi: 'Thêm...', id: 'Lainnya...', sv: 'Mer...',
  da: 'Mere...', fi: 'Lisää...', no: 'Mer...', sr: 'Још...',
};

/** Remove inline buttons from a message the user already answered */
async function clearInlineKeyboard(chatId: number, messageId: number): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
  }).catch(() => {});
}

/**
 * "Accept" / "Decline" under a connection request in the bot.
 * The pressing Telegram account must belong to the addressee; the answer goes through
 * the same service as the app, so a repeat or a second device changes nothing twice.
 */
async function handleConnectionRequestButton(cbq: NonNullable<TgUpdate['callback_query']>): Promise<void> {
  const db = getDb();
  const [kind, pendingId] = cbq.data!.split(':');
  const action = kind === 'pc_a' ? 'accept' : 'reject';
  const acc = await db.platformAccount.findFirst({
    where: { platform: 'TELEGRAM', platformId: String(cbq.from.id) },
    select: { userId: true, user: { select: { language: true, deletedAt: true } } },
  });
  const lang = acc?.user?.language || cbq.from.language_code?.slice(0, 2) || 'en';
  const { tg } = await import('./notification.service.js');
  if (!acc || acc.user?.deletedAt || !pendingId) {
    await answerCallbackQuery(cbq.id, tg(lang, 'pendingErrNotYours'));
    return;
  }
  const { respondToConnectionRequest, REQUEST_ERRORS } = await import('./connection-request.service.js');
  try {
    const res = await respondToConnectionRequest(db, pendingId, acc.userId, action);
    const done = res.outcome === 'accepted' || res.outcome === 'alreadyAccepted' ? 'pendingDoneAccepted' : 'pendingDoneRejected';
    await answerCallbackQuery(cbq.id, tg(lang, done));
    if (cbq.message) await clearInlineKeyboard(cbq.message.chat.id, cbq.message.message_id);
  } catch (err) {
    const code = (err as { message?: string }).message;
    const key = code === REQUEST_ERRORS.limitSelf ? 'pendingErrLimitSelf'
      : code === REQUEST_ERRORS.limitOther ? 'pendingErrLimitOther'
      : code === REQUEST_ERRORS.requesterGone ? 'pendingErrGone'
      : code === REQUEST_ERRORS.resolved ? 'pendingErrResolved'
      : 'pendingErrNotYours';
    await answerCallbackQuery(cbq.id, tg(lang, key));
    if (cbq.message && (key === 'pendingErrResolved' || key === 'pendingErrGone')) {
      await clearInlineKeyboard(cbq.message.chat.id, cbq.message.message_id);
    }
  }
}

/** Answer a Telegram callback query (dismiss loading spinner on inline button) */
async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  }).catch(() => {});
}

/** Send the next auto-chain message to a user on demand (triggered by "More..." button) */
export async function sendNextChainMessage(chatId: number): Promise<boolean> {
  const db = getDb();

  const acc = await db.platformAccount.findFirst({
    where: { platform: 'TELEGRAM', platformId: String(chatId) },
    select: { userId: true, user: { select: { language: true, createdAt: true } } },
  });
  if (!acc) return false;

  const userLang = acc.user?.language || 'en';

  // Already delivered messages
  const delivered = await db.autoChainDelivery.findMany({
    where: { userId: acc.userId },
    select: { messageId: true },
  });
  const deliveredIds = new Set(delivered.map((d) => d.messageId));

  // All active chain messages in order
  const messages = await db.autoChainMessage.findMany({
    where: { isActive: true },
    orderBy: [{ dayOffset: 'asc' }, { sortOrder: 'asc' }],
  });

  // Variant filter: check if user has connections
  const connectionCount = await db.connection.count({
    where: { OR: [{ userAId: acc.userId }, { userBId: acc.userId }] },
  });
  const hasConnections = connectionCount > 0;

  const nextMsg = messages.find((msg) => {
    if (deliveredIds.has(msg.id)) return false;
    if (isRetiredChainMessage(msg)) return false;
    if (msg.variant === 'invited' && !hasConnections) return false;
    if (msg.variant === 'organic' && hasConnections) return false;
    return true;
  });

  if (!nextMsg) return false;

  // Translate
  const translatedText = await translateWithCache(nextMsg.text, userLang).catch(() => nextMsg.text);

  // Build inline keyboard
  const buttons: TgReplyMarkup['inline_keyboard'] = [];
  if (nextMsg.buttonUrl && nextMsg.buttonText) {
    const rawBtn = nextMsg.buttonText;
    const rawUrl = nextMsg.buttonUrl;
    const btnText = await translateWithCache(rawBtn, userLang).catch(() => rawBtn);
    buttons.push([{ text: btnText, url: rawUrl }]);
  }
  const moreText = MORE_BUTTON[userLang] || MORE_BUTTON.en!;
  buttons.push([{ text: `📖 ${moreText}`, callback_data: 'next_chain' }]);
  const markup: TgReplyMarkup = { inline_keyboard: buttons };

  // Send
  const mediaSource = nextMsg.mediaFileId || nextMsg.mediaUrl;
  let ok = false;
  try {
    if (nextMsg.mediaType === 'photo' && mediaSource) {
      ok = await sendTelegramPhoto(String(chatId), mediaSource, translatedText, markup);
    } else if (nextMsg.mediaType === 'video' && mediaSource) {
      ok = await sendTelegramVideo(String(chatId), mediaSource, translatedText, markup);
    } else {
      ok = await sendTelegramMessage(String(chatId), translatedText, markup);
    }
  } catch {
    ok = false;
  }

  // Record delivery
  try {
    await db.autoChainDelivery.create({
      data: { messageId: nextMsg.id, userId: acc.userId, success: ok },
    });
  } catch { /* unique constraint */ }

  if (ok) {
    await db.autoChainMessage.update({
      where: { id: nextMsg.id },
      data: { sentCount: { increment: 1 } },
    });
  }

  return ok;
}

/** Handle incoming Telegram bot update (webhook) */
export async function handleTelegramUpdate(update: TgUpdate): Promise<void> {
  // Bot interaction of a linked account counts as activity (inactivity cleanup)
  touchTelegramUser(getDb(), update.callback_query?.from.id ?? update.message?.from?.id);

  // Handle callback query (inline button press)
  const cbq = update.callback_query;
  if (cbq?.data && /^pc_[ar]:/.test(cbq.data)) {
    await handleConnectionRequestButton(cbq);
    return;
  }
  if (cbq?.data === 'next_chain') {
    const sent = await sendNextChainMessage(cbq.from.id);
    if (sent) {
      await answerCallbackQuery(cbq.id);
    } else {
      const lang = cbq.from.language_code?.slice(0, 2) || 'en';
      const noMore: Record<string, string> = {
        en: 'No more messages for now', ru: 'Пока больше нет сообщений',
        uk: 'Поки більше немає повідомлень', es: 'No hay más mensajes por ahora',
        fr: 'Pas de nouveaux messages', de: 'Keine weiteren Nachrichten',
      };
      await answerCallbackQuery(cbq.id, noMore[lang] || noMore.en);
    }
    return;
  }

  const msg = update.message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const text = (msg.text || msg.caption || '').trim();
  const hasMedia = !!(msg.photo || msg.video || msg.document || msg.voice || msg.sticker);

  // If no text and no media — ignore
  if (!text && !hasMedia) return;

  // Handle /start with invite deep link: /start invite_TOKEN
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const param = parts[1]; // e.g. "invite_abc123..."
    const lang = msg.from?.language_code?.slice(0, 2) || 'en';
    const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || '';
    const loc = BOT_STRINGS[lang] ?? BOT_STRINGS.en!;

    if (param?.startsWith('invite_')) {
      const inviteToken = param.slice('invite_'.length);
      const webAppUrl = `${WEB_APP_URL}/invite/${inviteToken}`;

      console.log(`[TG Bot] /start invite from chat ${chatId}, token: ${inviteToken.slice(0, 8)}...`);

      // The inviter and their network, in the same numbers their Profile shows
      const inviter = await findInviter(inviteToken).catch(() => null);
      const stats = inviter ? await inviterNetworkStats(inviter.id).catch(() => null) : null;
      const inviterName = inviter?.name || 'Someone';

      await sendTelegramMessage(chatId, loc.invite(tgEscape(name), tgEscape(inviterName), stats), {
        inline_keyboard: [[{ text: loc.acceptBtn, web_app: { url: webAppUrl } }]],
      });

      // Track /start for reminder if user never opens the app
      trackBotStart(String(chatId), name, lang, inviteToken, msg.from?.username).catch(() => {});
      return;
    }

    if (param?.startsWith('sos_')) {
      const collectionId = param.slice('sos_'.length);
      const webAppUrl = `${WEB_APP_URL}/collection/${collectionId}?sos=true`;

      console.log(`[TG Bot] /start sos from chat ${chatId}, collectionId: ${collectionId}`);

      const db = getDb();
      const collection = await db.collection.findUnique({
        where: { id: collectionId },
        select: { creatorId: true, amount: true, creator: { select: { name: true } } },
      }).catch(() => null);

      const creatorName = collection?.creator?.name || 'Someone';
      const amountStr = collection?.amount ? ` ($${collection.amount})` : '';

      const SOS_BTN: Record<string, string> = {
        en: '🤝 Join & Help',
        ru: '🤝 Присоединиться и помочь',
        uk: '🤝 Приєднатись та допомогти',
        be: '🤝 Далучыцца і дапамагчы',
        de: '🤝 Beitreten & Helfen',
        fr: '🤝 Rejoindre et aider',
        es: '🤝 Unirse y ayudar',
        it: '🤝 Unisciti e aiuta',
        pt: '🤝 Juntar-se e ajudar',
        pl: '🤝 Dołącz i pomóż',
        nl: '🤝 Deelnemen & helpen',
        cs: '🤝 Připojit se a pomoci',
        ro: '🤝 Alătură-te și ajută',
        tr: '🤝 Katıl ve yardım et',
        ar: '🤝 انضم وساعد',
        he: '🤝 הצטרף ועזור',
        hi: '🤝 जुड़ें और मदद करें',
        zh: '🤝 加入并帮助',
        ja: '🤝 参加して助ける',
        ko: '🤝 참여하고 돕기',
        th: '🤝 เข้าร่วมและช่วยเหลือ',
        vi: '🤝 Tham gia và giúp đỡ',
        id: '🤝 Bergabung & Bantu',
        sv: '🤝 Gå med & hjälp',
        da: '🤝 Tilmeld & hjælp',
        fi: '🤝 Liity ja auta',
        sr: '🤝 Придружи се и помози',
      };
      const btnText = SOS_BTN[lang] ?? SOS_BTN.en!;

      const greeting = name ? `${name}, ` : '';
      const SOS_MSG: Record<string, (g: string, c: string, a: string) => string> = {
        en: (g, c, a) => `🆘 ${g}<b>${c}</b> needs help${a}.\n\nYou're invited as a <b>direct participant</b> — no approval needed. Click the button to join immediately.`,
        ru: (g, c, a) => `🆘 ${g}<b>${c}</b> просит о помощи${a}.\n\nВы приглашены как <b>прямой участник</b> — без ожидания подтверждения. Нажмите кнопку, чтобы присоединиться сразу.`,
        uk: (g, c, a) => `🆘 ${g}<b>${c}</b> просить про допомогу${a}.\n\nВас запрошено як <b>прямого учасника</b> — без очікування підтвердження.`,
      };
      const msgFn = SOS_MSG[lang] ?? SOS_MSG.en!;
      const msgText = msgFn(greeting, creatorName, amountStr);

      await sendTelegramMessage(chatId, msgText, {
        inline_keyboard: [[{ text: btnText, web_app: { url: webAppUrl } }]],
      });
      return;
    }

    // Plain /start — open the app + link to landing
    await sendTelegramMessage(chatId, loc.welcome(tgEscape(name)), {
      inline_keyboard: [[{ text: loc.openBtn, web_app: { url: WEB_APP_URL } }]],
    });

    // Track /start for reminder if user never opens the app
    trackBotStart(String(chatId), name, lang, undefined, msg.from?.username).catch(() => {});
    return;
  }

  // Forward any non-command message to the support chat
  const from = msg.from;
  const userName = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || 'Unknown';
  const userTag = from?.username ? ` (@${from.username})` : '';
  const tgUserId = from?.id ? ` [${from.id}]` : '';
  const platformId = String(chatId);

  // Send user info header first
  await sendTelegramMessage(
    SUPPORT_CHAT_ID,
    `💬 <b>Сообщение от пользователя</b>\n\n👤 ${userName}${userTag}${tgUserId}${!hasMedia && text ? `\n\n${text}` : ''}`,
  );

  // Forward the original message (preserves photos, videos, documents, etc.)
  if (hasMedia && msg.message_id) {
    await forwardTelegramMessage(chatId, SUPPORT_CHAT_ID, msg.message_id);
  }

  // Save to in-app support DB — find linked app user if any
  const db = getDb();
  const appAccount = await db.platformAccount.findFirst({
    where: { platform: 'TELEGRAM', platformId },
    select: { userId: true },
  }).catch(() => null);

  // Extract media info for storage
  const mediaFileId = msg.photo
    ? msg.photo[msg.photo.length - 1]?.file_id ?? null
    : msg.video?.file_id ?? msg.document?.file_id ?? msg.voice?.file_id ?? null;
  const mediaType = msg.photo ? 'photo'
    : msg.video ? 'video'
    : msg.document ? 'document'
    : msg.voice ? 'voice'
    : null;
  const mediaName = msg.document?.file_name ?? null;

  if (text || mediaFileId) {
    db.supportMessage.create({
      data: {
        userId: appAccount?.userId ?? null,
        platformId,
        userName,
        fromAdmin: false,
        message: text || '',
        mediaFileId,
        mediaType,
        mediaName,
      },
    }).catch((err) => console.error('[Support] Failed to save TG message:', err));
  }

  // Reply to user
  await sendTelegramMessage(
    chatId,
    `Thank you for your message! Our team has received it. 🙏`,
    {
      inline_keyboard: [[{ text: '📱 Open App', web_app: { url: WEB_APP_URL } }]],
    },
  );
}

/**
 * Send an array of TG messages via direct send or BullMQ.
 * `kind`: 'wave' for messages about a Need (sent first), 'bulk' for mailings to everyone.
 */
export async function sendTgMessages(
  messages: Array<{ telegramId: string; text: string; replyMarkup?: TgReplyMarkup }>,
  kind: 'wave' | 'bulk' = 'wave',
): Promise<void> {
  if (messages.length === 0) return;
  const DIRECT_SEND_THRESHOLD = 25;

  if (messages.length <= DIRECT_SEND_THRESHOLD) {
    let sent = 0;
    let failed = 0;
    for (const msg of messages) {
      try {
        const ok = await sendTelegramMessage(msg.telegramId, msg.text, msg.replyMarkup);
        if (ok) sent++; else failed++;
      } catch { failed++; }
    }
    console.log(`[TG] Direct send: sent=${sent}, failed=${failed}`);
    return;
  }

  try {
    const { enqueueTgBroadcast } = await import('../workers/index.js');
    await enqueueTgBroadcast(messages, kind);
    console.log(`[TG] Enqueued ${messages.length} messages via BullMQ`);
  } catch (err) {
    console.error('[TG] BullMQ failed, fallback to direct:', err);
    let sent = 0;
    for (const msg of messages) {
      try {
        const ok = await sendTelegramMessage(msg.telegramId, msg.text, msg.replyMarkup);
        if (ok) sent++;
        if (sent % 25 === 0) await new Promise((r) => setTimeout(r, 1100));
      } catch { /* continue */ }
    }
    console.log(`[TG] Fallback: ${sent}/${messages.length}`);
  }
}

/** Upload a media file to Telegram via support chat, returns file_id for reuse */
export async function uploadMediaToTelegram(
  fileBuffer: Buffer,
  filename: string,
  mediaType: 'photo' | 'video',
): Promise<string | null> {
  if (!TELEGRAM_BOT_TOKEN) return null;

  const method = mediaType === 'photo' ? 'sendPhoto' : 'sendVideo';
  const field = mediaType === 'photo' ? 'photo' : 'video';

  const formData = new FormData();
  formData.append('chat_id', String(SUPPORT_CHAT_ID));
  formData.append(field, new Blob([new Uint8Array(fileBuffer)]), filename);
  formData.append('caption', `[Загрузка для рассылки] ${filename}`);
  if (mediaType === 'video') formData.append('supports_streaming', 'true');

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    body: formData,
  });
  const json = (await res.json()) as {
    ok: boolean;
    result?: { photo?: Array<{ file_id: string }>; video?: { file_id: string } };
    description?: string;
  };

  if (!json.ok) {
    console.error(`[TG Bot] upload ${mediaType} failed: ${json.description}`);
    return null;
  }

  if (mediaType === 'photo') {
    const photos = json.result?.photo;
    return photos?.[photos.length - 1]?.file_id ?? null;
  }
  return json.result?.video?.file_id ?? null;
}

/** Get download URL for a Telegram file by file_id */
export async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  if (!TELEGRAM_BOT_TOKEN) return null;
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  const json = (await res.json()) as { ok: boolean; result?: { file_path?: string } };
  if (!json.ok || !json.result?.file_path) return null;
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${json.result.file_path}`;
}

/** Register webhook URL with Telegram Bot API */
/**
 * Secret Telegram sends back in X-Telegram-Bot-Api-Secret-Token on every webhook call (SO-14).
 * Derived from the bot token, so no extra env var; changes together with the token.
 */
export function telegramWebhookSecret(): string {
  return createHash('sha256').update(`so-webhook:${TELEGRAM_BOT_TOKEN}`).digest('hex');
}

export async function setTelegramWebhook(webhookUrl: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('[TG Bot] No TELEGRAM_BOT_TOKEN, skipping webhook setup');
    return false;
  }

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
      secret_token: telegramWebhookSecret(),
    }),
  });

  const json = (await res.json()) as TgApiResponse;
  if (json.ok) {
    console.log(`[TG Bot] Webhook set to ${webhookUrl}`);
  } else {
    console.error(`[TG Bot] setWebhook failed: ${json.description}`);
  }
  return json.ok;
}
