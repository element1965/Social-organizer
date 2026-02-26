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

/** Remove a user who blocked the bot: hard-delete User (cascades to all relations).
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
      // Fetch user info before deletion for logging
      const [user, contacts] = await Promise.all([
        db.user.findUnique({ where: { id: account.userId }, select: { name: true } }),
        db.userContact.findMany({ where: { userId: account.userId }, select: { type: true, value: true } }),
      ]);
      // Hard-delete User — cascades to PlatformAccount, Connection,
      // PendingConnection, InviteLink, Obligation, Notification, etc.
      await db.user.delete({ where: { id: account.userId } });
      blockedCounter.count += 1;
      const info: RemovedUserInfo = {
        name: user?.name ?? 'Unknown',
        platformId,
        userId: account.userId,
        contacts,
      };
      blockedCounter.removed.push(info);
      console.log(`[TG Bot] Hard-deleted blocked user ${platformId} (${info.name}, userId: ${account.userId})`);
      return info;
    } else {
      // No user found — just clean up orphaned platform account
      const deleted = await db.platformAccount.deleteMany({
        where: { platform: 'TELEGRAM', platformId },
      });
      if (deleted.count > 0) blockedCounter.count += deleted.count;
      console.log(`[TG Bot] Removed orphaned platform account ${platformId}`);
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
    chat: { id: number };
    text?: string;
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
async function trackBotStart(chatId: string, name: string, lang: string, inviteToken?: string): Promise<void> {
  const db = getDb();
  // Skip if user already has an account
  const existing = await db.platformAccount.findFirst({
    where: { platform: 'TELEGRAM', platformId: chatId },
    select: { id: true },
  });
  if (existing) return;

  await db.botStart.upsert({
    where: { chatId },
    create: { chatId, name: name || null, language: lang, inviteToken: inviteToken || null },
    update: { name: name || undefined, language: lang, inviteToken: inviteToken || undefined },
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
    text: '👋 {inviteeName} запустил бот по вашему приглашению, но ещё не открыл приложение. Подскажите — нужно нажать кнопку «Open» внизу чата с ботом.',
  },
  {
    level: 1,
    text: '⏰ Прошли сутки, а {inviteeName} так и не открыл приложение. Возможно, нужна ваша помощь — напишите или позвоните, помогите разобраться с входом!',
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
  invite: (name: string) => string;
  acceptBtn: string;
  welcome: (name: string) => string;
  openBtn: string;
}
function makeBotLocale(
  welcomeWord: string, // "Welcome" / "Добро пожаловать" — with lowercase first letter
  inviteBody: string,
  acceptBtn: string,
  welcomeBody: string,
  openBtn: string,
  learnMore: string,
): BotLocale {
  return {
    invite: (name) =>
      `👋 ${name ? name + ', ' + welcomeWord : welcomeWord.charAt(0).toUpperCase() + welcomeWord.slice(1)} <b>Social Organizer</b>!\n\n${inviteBody}\n\n🌐 <a href="${SITE}">${learnMore}</a>`,
    acceptBtn: `🤝 ${acceptBtn}`,
    welcome: (name) =>
      `👋 ${name ? name + ', ' + welcomeWord : welcomeWord.charAt(0).toUpperCase() + welcomeWord.slice(1)} <b>Social Organizer</b>!\n\n${welcomeBody}\n\n🌐 <a href="${SITE}">${learnMore}</a>`,
    openBtn: `📱 ${openBtn}`,
  };
}

const BOT_STRINGS: Record<string, BotLocale> = {
  en: makeBotLocale(
    'welcome to', 'You\'ve been invited to join a trusted support network.\nTap the button below to accept the invitation.',
    'Accept Invitation', 'A platform for mutual support through trusted networks.', 'Open App', 'Learn more'),
  ru: makeBotLocale(
    'добро пожаловать в', 'Тебя пригласили в сеть взаимной поддержки.\nНажми кнопку ниже, чтобы принять приглашение.',
    'Принять приглашение', 'Платформа взаимной поддержки через доверенные сети.', 'Открыть приложение', 'Узнать больше'),
  uk: makeBotLocale(
    'ласкаво просимо до', 'Тебе запросили приєднатися до мережі взаємної підтримки.\nНатисни кнопку нижче, щоб прийняти запрошення.',
    'Прийняти запрошення', 'Платформа взаємної підтримки через довірені мережі.', 'Відкрити застосунок', 'Дізнатися більше'),
  be: makeBotLocale(
    'вітаем у', 'Цябе запрасілі далучыцца да сеткі ўзаемнай падтрымкі.\nНацісні кнопку ніжэй, каб прыняць запрашэнне.',
    'Прыняць запрашэнне', 'Платформа ўзаемнай падтрымкі праз давераныя сеткі.', 'Адкрыць дадатак', 'Даведацца больш'),
  es: makeBotLocale(
    'bienvenido a', 'Te han invitado a unirte a una red de apoyo de confianza.\nToca el botón de abajo para aceptar la invitación.',
    'Aceptar invitación', 'Una plataforma de apoyo mutuo a través de redes de confianza.', 'Abrir app', 'Saber más'),
  fr: makeBotLocale(
    'bienvenue sur', 'Tu as été invité(e) à rejoindre un réseau de soutien de confiance.\nAppuie sur le bouton ci-dessous pour accepter l\'invitation.',
    'Accepter l\'invitation', 'Une plateforme d\'entraide à travers des réseaux de confiance.', 'Ouvrir l\'appli', 'En savoir plus'),
  de: makeBotLocale(
    'willkommen bei', 'Du wurdest eingeladen, einem vertrauenswürdigen Unterstützungsnetzwerk beizutreten.\nTippe auf den Button unten, um die Einladung anzunehmen.',
    'Einladung annehmen', 'Eine Plattform für gegenseitige Unterstützung durch vertrauenswürdige Netzwerke.', 'App öffnen', 'Mehr erfahren'),
  pt: makeBotLocale(
    'bem-vindo ao', 'Você foi convidado a participar de uma rede de apoio confiável.\nToque no botão abaixo para aceitar o convite.',
    'Aceitar convite', 'Uma plataforma de apoio mútuo através de redes de confiança.', 'Abrir app', 'Saiba mais'),
  it: makeBotLocale(
    'benvenuto in', 'Sei stato invitato a unirti a una rete di supporto affidabile.\nTocca il pulsante qui sotto per accettare l\'invito.',
    'Accetta invito', 'Una piattaforma di supporto reciproco attraverso reti fidate.', 'Apri app', 'Scopri di più'),
  pl: makeBotLocale(
    'witaj w', 'Zaproszono Cię do sieci wzajemnego wsparcia.\nKliknij przycisk poniżej, aby przyjąć zaproszenie.',
    'Przyjmij zaproszenie', 'Platforma wzajemnego wsparcia przez zaufane sieci.', 'Otwórz aplikację', 'Dowiedz się więcej'),
  nl: makeBotLocale(
    'welkom bij', 'Je bent uitgenodigd om lid te worden van een vertrouwd ondersteuningsnetwerk.\nTik op de knop hieronder om de uitnodiging te accepteren.',
    'Uitnodiging accepteren', 'Een platform voor wederzijdse ondersteuning via vertrouwde netwerken.', 'App openen', 'Meer info'),
  cs: makeBotLocale(
    'vítej v', 'Byl/a jsi pozván/a do důvěryhodné podpůrné sítě.\nKlikni na tlačítko níže pro přijetí pozvánky.',
    'Přijmout pozvánku', 'Platforma vzájemné podpory prostřednictvím důvěryhodných sítí.', 'Otevřít aplikaci', 'Zjistit více'),
  ro: makeBotLocale(
    'bun venit la', 'Ai fost invitat să te alături unei rețele de sprijin de încredere.\nApasă butonul de mai jos pentru a accepta invitația.',
    'Acceptă invitația', 'O platformă de sprijin reciproc prin rețele de încredere.', 'Deschide aplicația', 'Află mai multe'),
  tr: makeBotLocale(
    'hoş geldin,', 'Güvenilir bir destek ağına katılmaya davet edildin.\nDaveti kabul etmek için aşağıdaki düğmeye dokun.',
    'Daveti kabul et', 'Güvenilir ağlar aracılığıyla karşılıklı destek platformu.', 'Uygulamayı aç', 'Daha fazla bilgi'),
  ar: makeBotLocale(
    'مرحباً بك في', 'لقد تمت دعوتك للانضمام إلى شبكة دعم موثوقة.\nاضغط على الزر أدناه لقبول الدعوة.',
    'قبول الدعوة', 'منصة للدعم المتبادل من خلال شبكات موثوقة.', 'فتح التطبيق', 'اعرف المزيد'),
  he: makeBotLocale(
    'ברוך הבא ל', 'הוזמנת להצטרף לרשת תמיכה מהימנה.\nלחץ על הכפתור למטה כדי לקבל את ההזמנה.',
    'קבל הזמנה', 'פלטפורמה לתמיכה הדדית דרך רשתות מהימנות.', 'פתח אפליקציה', 'למידע נוסף'),
  hi: makeBotLocale(
    'में आपका स्वागत है,', 'आपको एक विश्वसनीय सहायता नेटवर्क से जुड़ने के लिए आमंत्रित किया गया है।\nनिमंत्रण स्वीकार करने के लिए नीचे बटन दबाएं।',
    'निमंत्रण स्वीकार करें', 'विश्वसनीय नेटवर्क के माध्यम से पारस्परिक सहायता का मंच।', 'ऐप खोलें', 'और जानें'),
  zh: makeBotLocale(
    '欢迎来到', '你被邀请加入一个可信赖的互助网络。\n点击下面的按钮接受邀请。',
    '接受邀请', '通过可信赖网络实现互助的平台。', '打开应用', '了解更多'),
  ja: makeBotLocale(
    'へようこそ、', '信頼できるサポートネットワークへの招待を受けました。\n下のボタンをタップして招待を受け入れてください。',
    '招待を受ける', '信頼できるネットワークを通じた相互支援プラットフォーム。', 'アプリを開く', '詳細を見る'),
  ko: makeBotLocale(
    '에 오신 것을 환영합니다,', '신뢰할 수 있는 지원 네트워크에 초대되었습니다.\n아래 버튼을 눌러 초대를 수락하세요.',
    '초대 수락', '신뢰할 수 있는 네트워크를 통한 상호 지원 플랫폼.', '앱 열기', '자세히 알아보기'),
  th: makeBotLocale(
    'ยินดีต้อนรับสู่', 'คุณได้รับเชิญให้เข้าร่วมเครือข่ายสนับสนุนที่เชื่อถือได้\nแตะปุ่มด้านล่างเพื่อรับคำเชิญ',
    'รับคำเชิญ', 'แพลตฟอร์มสนับสนุนซึ่งกันและกันผ่านเครือข่ายที่เชื่อถือได้', 'เปิดแอป', 'เรียนรู้เพิ่มเติม'),
  vi: makeBotLocale(
    'chào mừng đến với', 'Bạn đã được mời tham gia mạng lưới hỗ trợ đáng tin cậy.\nNhấn nút bên dưới để chấp nhận lời mời.',
    'Chấp nhận lời mời', 'Nền tảng hỗ trợ lẫn nhau thông qua mạng lưới đáng tin cậy.', 'Mở ứng dụng', 'Tìm hiểu thêm'),
  id: makeBotLocale(
    'selamat datang di', 'Kamu diundang untuk bergabung dengan jaringan dukungan terpercaya.\nKetuk tombol di bawah untuk menerima undangan.',
    'Terima undangan', 'Platform dukungan bersama melalui jaringan terpercaya.', 'Buka aplikasi', 'Pelajari lebih lanjut'),
  sv: makeBotLocale(
    'välkommen till', 'Du har blivit inbjuden att gå med i ett pålitligt stödnätverk.\nTryck på knappen nedan för att acceptera inbjudan.',
    'Acceptera inbjudan', 'En plattform för ömsesidigt stöd genom pålitliga nätverk.', 'Öppna appen', 'Läs mer'),
  da: makeBotLocale(
    'velkommen til', 'Du er blevet inviteret til at deltage i et pålideligt støttenetværk.\nTryk på knappen nedenfor for at acceptere invitationen.',
    'Accepter invitation', 'En platform for gensidig støtte gennem pålidelige netværk.', 'Åbn appen', 'Læs mere'),
  fi: makeBotLocale(
    'tervetuloa palveluun', 'Sinut on kutsuttu liittymään luotettavaan tukiverkostoon.\nNapauta alla olevaa painiketta hyväksyäksesi kutsun.',
    'Hyväksy kutsu', 'Keskinäisen tuen alusta luotettavien verkostojen kautta.', 'Avaa sovellus', 'Lue lisää'),
  no: makeBotLocale(
    'velkommen til', 'Du har blitt invitert til å bli med i et pålitelig støttenettverk.\nTrykk på knappen nedenfor for å akseptere invitasjonen.',
    'Aksepter invitasjon', 'En plattform for gjensidig støtte gjennom pålitelige nettverk.', 'Åpne appen', 'Les mer'),
  sr: makeBotLocale(
    'добродошли у', 'Позвани сте да се придружите мрежи узајамне подршке.\nДодирните дугме испод да прихватите позив.',
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
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Handle /start with invite deep link: /start invite_TOKEN
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const param = parts[1]; // e.g. "invite_abc123..."
    const lang = msg.from?.language_code?.slice(0, 2) || 'en';
    const name = msg.from?.first_name || '';
    const loc = BOT_STRINGS[lang] ?? BOT_STRINGS.en!;

    if (param?.startsWith('invite_')) {
      const inviteToken = param.slice('invite_'.length);
      const webAppUrl = `${WEB_APP_URL}/invite/${inviteToken}`;

      console.log(`[TG Bot] /start invite from chat ${chatId}, token: ${inviteToken.slice(0, 8)}...`);

      await sendTelegramMessage(chatId, loc.invite(name), {
        inline_keyboard: [[{ text: loc.acceptBtn, web_app: { url: webAppUrl } }]],
      });

      // Track /start for reminder if user never opens the app
      trackBotStart(String(chatId), name, lang, inviteToken).catch(() => {});
      return;
    }

    // Plain /start — open the app + link to landing
    await sendTelegramMessage(chatId, loc.welcome(name), {
      inline_keyboard: [[{ text: loc.openBtn, web_app: { url: WEB_APP_URL } }]],
    });

    // Track /start for reminder if user never opens the app
    trackBotStart(String(chatId), name, lang).catch(() => {});
    return;
  }

  // Forward any non-command text to the support chat
  const from = msg.from;
  const userName = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || 'Unknown';
  const userTag = from?.username ? ` (@${from.username})` : '';
  const userId = from?.id ? ` [${from.id}]` : '';

  await sendTelegramMessage(
    SUPPORT_CHAT_ID,
    `💬 <b>Сообщение от пользователя</b>\n\n👤 ${userName}${userTag}${userId}\n\n${text}`,
  );

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
