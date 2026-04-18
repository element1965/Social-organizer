import { getDb } from '@so/db';
import { translateWithCache } from './translate.service.js';

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
 *  If the user has invitees — soft delete (mute) to keep their network intact.
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
      // Fetch user info before deletion for logging
      const [user, contacts, usedInviteCount] = await Promise.all([
        db.user.findUnique({ where: { id: userId }, select: { name: true } }),
        db.userContact.findMany({ where: { userId }, select: { type: true, value: true } }),
        db.inviteLink.count({ where: { inviterId: userId, usedById: { not: null } } }),
      ]);

      if (usedInviteCount > 0) {
        // Has invitees — soft delete (mute) so their network stays intact
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
        console.log(`[TG Bot] Soft-deleted (muted) user ${platformId} (${user?.name}, userId: ${userId}) — has ${usedInviteCount} invitees`);
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
  if (!TELEGRAM_BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId }),
    });
    const json = (await res.json()) as TgApiResponse;
    if (json.ok) return true;
    // 400 "chat not found" or 403 "bot was blocked" → user is unreachable
    return false;
  } catch {
    // Network error — assume chat exists (don't delete on transient failures)
    return true;
  }
}

function isBlockedError(status: number, description?: string): boolean {
  if (status === 403) return true;
  if (description && (
    description.includes('bot was blocked') ||
    description.includes('user is deactivated') ||
    description.includes('chat not found')
  )) return true;
  return false;
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
    text: '🤝 {inviterName} пригласил тебя в сеть взаимной поддержки. Открой приложение — регистрация за 1 минуту.',
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

/** Low-level wrapper: send a message via Telegram Bot API with 429 retry */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: TgReplyMarkup,
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
    if (isBlockedError(res.status, json.description)) {
      await removeBlockedUser(chatId);
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
  const typeLabel = type === 'EMERGENCY' ? 'Emergency' : 'Regular';

  const amountStr = amount != null ? `${amount} ${currency}` : 'open';
  const text = `${emoji} <b>New ${typeLabel} Collection</b>\n\nFrom: <b>${creatorName}</b>\nAmount: ${amountStr}\n\nSomeone in your network needs support.`;

  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  const replyMarkup: TgReplyMarkup = {
    inline_keyboard: [[{ text: '📱 Open', web_app: { url: webAppLink } }]],
  };

  return sendTelegramMessage(telegramId, text, replyMarkup);
}

// Bot /start message translations for all 27 supported languages
const SITE = 'https://www.orginizer.com/';
interface BotLocale {
  invite: (name: string, inviterName: string, people: number, totalUsd: number) => string;
  acceptBtn: string;
  welcome: (name: string) => string;
  openBtn: string;
}
function makeBotLocale(
  welcomeWord: string, // "Welcome" / "Добро пожаловать" — with lowercase first letter
  inviteBody: (inviterName: string, people: number, totalUsd: number) => string,
  acceptBtn: string,
  welcomeBody: string,
  openBtn: string,
  learnMore: string,
): BotLocale {
  return {
    invite: (name, inviterName, people, totalUsd) =>
      `👋 ${name ? name + ', ' + welcomeWord : welcomeWord.charAt(0).toUpperCase() + welcomeWord.slice(1)} <b>Social Organizer</b>!\n\n${inviteBody(inviterName, people, totalUsd)}\n\n🌐 <a href="${SITE}">${learnMore}</a>`,
    acceptBtn: `🤝 ${acceptBtn}`,
    welcome: (name) =>
      `👋 ${name ? name + ', ' + welcomeWord : welcomeWord.charAt(0).toUpperCase() + welcomeWord.slice(1)} <b>Social Organizer</b>!\n\n${welcomeBody}\n\n🌐 <a href="${SITE}">${learnMore}</a>`,
    openBtn: `📱 ${openBtn}`,
  };
}

/** Get global network stats: total users + total declared budget in USD */
async function getNetworkStats(): Promise<{ people: number; totalUsd: number }> {
  const db = getDb();
  const [people, agg] = await Promise.all([
    db.user.count(),
    db.user.aggregate({ _sum: { monthlyBudget: true } }),
  ]);
  return { people, totalUsd: Math.round(agg._sum.monthlyBudget ?? 0) };
}

const BOT_STRINGS: Record<string, BotLocale> = {
  en: makeBotLocale(
    'welcome to', (inv, p, usd) => `<b>${inv}</b> invites you to a mutual aid network.\nToday in the network: ${p} people and $${usd}.`,
    'Accept Invitation', 'A platform for mutual support through trusted networks.', 'Open App', 'Learn more'),
  ru: makeBotLocale(
    'добро пожаловать в', (inv, p, usd) => `<b>${inv}</b> приглашает Вас в сеть взаимопомощи.\nСегодня в сети: ${p} человек и $${usd}.`,
    'Принять приглашение', 'Платформа взаимной поддержки через доверенные сети.', 'Открыть приложение', 'Узнать больше'),
  uk: makeBotLocale(
    'ласкаво просимо до', (inv, p, usd) => `<b>${inv}</b> запрошує Вас до мережі взаємодопомоги.\nСьогодні в мережі: ${p} людей та $${usd}.`,
    'Прийняти запрошення', 'Платформа взаємної підтримки через довірені мережі.', 'Відкрити застосунок', 'Дізнатися більше'),
  be: makeBotLocale(
    'вітаем у', (inv, p, usd) => `<b>${inv}</b> запрашае Вас у сетку ўзаемадапамогі.\nСёння ў сетцы: ${p} чалавек і $${usd}.`,
    'Прыняць запрашэнне', 'Платформа ўзаемнай падтрымкі праз давераныя сеткі.', 'Адкрыць дадатак', 'Даведацца больш'),
  es: makeBotLocale(
    'bienvenido a', (inv, p, usd) => `<b>${inv}</b> te invita a una red de ayuda mutua.\nHoy en la red: ${p} personas y $${usd}.`,
    'Aceptar invitación', 'Una plataforma de apoyo mutuo a través de redes de confianza.', 'Abrir app', 'Saber más'),
  fr: makeBotLocale(
    'bienvenue sur', (inv, p, usd) => `<b>${inv}</b> vous invite dans un réseau d'entraide.\nAujourd'hui dans le réseau : ${p} personnes et $${usd}.`,
    'Accepter l\'invitation', 'Une plateforme d\'entraide à travers des réseaux de confiance.', 'Ouvrir l\'appli', 'En savoir plus'),
  de: makeBotLocale(
    'willkommen bei', (inv, p, usd) => `<b>${inv}</b> lädt Sie in ein Netzwerk gegenseitiger Hilfe ein.\nHeute im Netzwerk: ${p} Personen und $${usd}.`,
    'Einladung annehmen', 'Eine Plattform für gegenseitige Unterstützung durch vertrauenswürdige Netzwerke.', 'App öffnen', 'Mehr erfahren'),
  pt: makeBotLocale(
    'bem-vindo ao', (inv, p, usd) => `<b>${inv}</b> convida você para uma rede de ajuda mútua.\nHoje na rede: ${p} pessoas e $${usd}.`,
    'Aceitar convite', 'Uma plataforma de apoio mútuo através de redes de confiança.', 'Abrir app', 'Saiba mais'),
  it: makeBotLocale(
    'benvenuto in', (inv, p, usd) => `<b>${inv}</b> ti invita in una rete di aiuto reciproco.\nOggi nella rete: ${p} persone e $${usd}.`,
    'Accetta invito', 'Una piattaforma di supporto reciproco attraverso reti fidate.', 'Apri app', 'Scopri di più'),
  pl: makeBotLocale(
    'witaj w', (inv, p, usd) => `<b>${inv}</b> zaprasza Cię do sieci wzajemnej pomocy.\nDziś w sieci: ${p} osób i $${usd}.`,
    'Przyjmij zaproszenie', 'Platforma wzajemnego wsparcia przez zaufane sieci.', 'Otwórz aplikację', 'Dowiedz się więcej'),
  nl: makeBotLocale(
    'welkom bij', (inv, p, usd) => `<b>${inv}</b> nodigt u uit voor een netwerk van wederzijdse hulp.\nVandaag in het netwerk: ${p} mensen en $${usd}.`,
    'Uitnodiging accepteren', 'Een platform voor wederzijdse ondersteuning via vertrouwde netwerken.', 'App openen', 'Meer info'),
  cs: makeBotLocale(
    'vítej v', (inv, p, usd) => `<b>${inv}</b> vás zve do sítě vzájemné pomoci.\nDnes v síti: ${p} lidí a $${usd}.`,
    'Přijmout pozvánku', 'Platforma vzájemné podpory prostřednictvím důvěryhodných sítí.', 'Otevřít aplikaci', 'Zjistit více'),
  ro: makeBotLocale(
    'bun venit la', (inv, p, usd) => `<b>${inv}</b> vă invită într-o rețea de ajutor reciproc.\nAstăzi în rețea: ${p} persoane și $${usd}.`,
    'Acceptă invitația', 'O platformă de sprijin reciproc prin rețele de încredere.', 'Deschide aplicația', 'Află mai multe'),
  tr: makeBotLocale(
    'hoş geldin,', (inv, p, usd) => `<b>${inv}</b> sizi bir karşılıklı yardım ağına davet ediyor.\nBugün ağda: ${p} kişi ve $${usd}.`,
    'Daveti kabul et', 'Güvenilir ağlar aracılığıyla karşılıklı destek platformu.', 'Uygulamayı aç', 'Daha fazla bilgi'),
  ar: makeBotLocale(
    'مرحباً بك في', (inv, p, usd) => `<b>${inv}</b> يدعوك إلى شبكة مساعدة متبادلة.\nاليوم في الشبكة: ${p} شخص و $${usd}.`,
    'قبول الدعوة', 'منصة للدعم المتبادل من خلال شبكات موثوقة.', 'فتح التطبيق', 'اعرف المزيد'),
  he: makeBotLocale(
    'ברוך הבא ל', (inv, p, usd) => `<b>${inv}</b> מזמין אותך לרשת עזרה הדדית.\nהיום ברשת: ${p} אנשים ו-$${usd}.`,
    'קבל הזמנה', 'פלטפורמה לתמיכה הדדית דרך רשתות מהימנות.', 'פתח אפליקציה', 'למידע נוסף'),
  hi: makeBotLocale(
    'में आपका स्वागत है,', (inv, p, usd) => `<b>${inv}</b> आपको पारस्परिक सहायता नेटवर्क में आमंत्रित करते हैं।\nआज नेटवर्क में: ${p} लोग और $${usd}.`,
    'निमंत्रण स्वीकार करें', 'विश्वसनीय नेटवर्क के माध्यम से पारस्परिक सहायता का मंच।', 'ऐप खोलें', 'और जानें'),
  zh: makeBotLocale(
    '欢迎来到', (inv, p, usd) => `<b>${inv}</b> 邀请您加入互助网络。\n网络现有：${p} 人，$${usd}。`,
    '接受邀请', '通过可信赖网络实现互助的平台。', '打开应用', '了解更多'),
  ja: makeBotLocale(
    'へようこそ、', (inv, p, usd) => `<b>${inv}</b>が相互扶助ネットワークに招待しています。\n現在のネットワーク：${p}人、$${usd}。`,
    '招待を受ける', '信頼できるネットワークを通じた相互支援プラットフォーム。', 'アプリを開く', '詳細を見る'),
  ko: makeBotLocale(
    '에 오신 것을 환영합니다,', (inv, p, usd) => `<b>${inv}</b>님이 상호 부조 네트워크에 초대합니다.\n현재 네트워크: ${p}명, $${usd}.`,
    '초대 수락', '신뢰할 수 있는 네트워크를 통한 상호 지원 플랫폼.', '앱 열기', '자세히 알아보기'),
  th: makeBotLocale(
    'ยินดีต้อนรับสู่', (inv, p, usd) => `<b>${inv}</b> เชิญคุณเข้าร่วมเครือข่ายช่วยเหลือซึ่งกันและกัน\nวันนี้ในเครือข่าย: ${p} คน และ $${usd}`,
    'รับคำเชิญ', 'แพลตฟอร์มสนับสนุนซึ่งกันและกันผ่านเครือข่ายที่เชื่อถือได้', 'เปิดแอป', 'เรียนรู้เพิ่มเติม'),
  vi: makeBotLocale(
    'chào mừng đến với', (inv, p, usd) => `<b>${inv}</b> mời bạn vào mạng lưới hỗ trợ lẫn nhau.\nHôm nay trong mạng: ${p} người và $${usd}.`,
    'Chấp nhận lời mời', 'Nền tảng hỗ trợ lẫn nhau thông qua mạng lưới đáng tin cậy.', 'Mở ứng dụng', 'Tìm hiểu thêm'),
  id: makeBotLocale(
    'selamat datang di', (inv, p, usd) => `<b>${inv}</b> mengundang Anda ke jaringan bantuan bersama.\nHari ini di jaringan: ${p} orang dan $${usd}.`,
    'Terima undangan', 'Platform dukungan bersama melalui jaringan terpercaya.', 'Buka aplikasi', 'Pelajari lebih lanjut'),
  sv: makeBotLocale(
    'välkommen till', (inv, p, usd) => `<b>${inv}</b> bjuder in dig till ett nätverk för ömsesidig hjälp.\nIdag i nätverket: ${p} personer och $${usd}.`,
    'Acceptera inbjudan', 'En plattform för ömsesidigt stöd genom pålitliga nätverk.', 'Öppna appen', 'Läs mer'),
  da: makeBotLocale(
    'velkommen til', (inv, p, usd) => `<b>${inv}</b> inviterer dig til et netværk for gensidig hjælp.\nI dag i netværket: ${p} personer og $${usd}.`,
    'Accepter invitation', 'En platform for gensidig støtte gennem pålidelige netværk.', 'Åbn appen', 'Læs mere'),
  fi: makeBotLocale(
    'tervetuloa palveluun', (inv, p, usd) => `<b>${inv}</b> kutsuu sinut keskinäisen avun verkostoon.\nTänään verkostossa: ${p} henkilöä ja $${usd}.`,
    'Hyväksy kutsu', 'Keskinäisen tuen alusta luotettavien verkostojen kautta.', 'Avaa sovellus', 'Lue lisää'),
  no: makeBotLocale(
    'velkommen til', (inv, p, usd) => `<b>${inv}</b> inviterer deg til et nettverk for gjensidig hjelp.\nI dag i nettverket: ${p} personer og $${usd}.`,
    'Aksepter invitasjon', 'En plattform for gjensidig støtte gjennom pålitelige nettverk.', 'Åpne appen', 'Les mer'),
  sr: makeBotLocale(
    'добродошли у', (inv, p, usd) => `<b>${inv}</b> вас позива у мрежу узајамне помоћи.\nДанас у мрежи: ${p} људи и $${usd}.`,
    'Прихвати позив', 'Платформа за узајамну подршку кроз мреже поверења.', 'Отвори апликацију', 'Сазнајте више'),
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
  // Handle callback query (inline button press)
  const cbq = update.callback_query;
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

      // Get inviter name and network stats for the invite message
      const [inviter, stats] = await Promise.all([
        findInviterTg(inviteToken).catch(() => null),
        getNetworkStats().catch(() => ({ people: 0, totalUsd: 0 })),
      ]);
      const inviterName = inviter?.name || 'Someone';

      await sendTelegramMessage(chatId, loc.invite(name, inviterName, stats.people, stats.totalUsd), {
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
    await sendTelegramMessage(chatId, loc.welcome(name), {
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

/** Send an array of TG messages via direct send or BullMQ */
export async function sendTgMessages(messages: Array<{ telegramId: string; text: string; replyMarkup?: TgReplyMarkup }>): Promise<void> {
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
    await enqueueTgBroadcast(messages);
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
  formData.append(field, new Blob([fileBuffer]), filename);
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
export async function setTelegramWebhook(webhookUrl: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('[TG Bot] No TELEGRAM_BOT_TOKEN, skipping webhook setup');
    return false;
  }

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'callback_query'] }),
  });

  const json = (await res.json()) as TgApiResponse;
  if (json.ok) {
    console.log(`[TG Bot] Webhook set to ${webhookUrl}`);
  } else {
    console.error(`[TG Bot] setWebhook failed: ${json.description}`);
  }
  return json.ok;
}
