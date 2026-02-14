import { getDb } from '@so/db';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

/** Counter for users removed during a broadcast (blocked bot / deactivated) */
export const blockedCounter = { count: 0, reset() { this.count = 0; } };

/** Delete PlatformAccount for a user who blocked the bot */
async function removeBlockedUser(chatId: string | number): Promise<void> {
  const platformId = String(chatId);
  try {
    const db = getDb();
    const deleted = await db.platformAccount.deleteMany({
      where: { platform: 'TELEGRAM', platformId },
    });
    if (deleted.count > 0) {
      blockedCounter.count += deleted.count;
      console.log(`[TG Bot] Removed blocked user ${platformId} from platform_accounts`);
    }
  } catch (err) {
    console.error(`[TG Bot] Failed to remove blocked user ${platformId}:`, err);
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
  inline_keyboard: Array<Array<{ text: string; url?: string; web_app?: { url: string } }>>;
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
    };
  };
}

export const SUPPORT_CHAT_ID = -4946509857;

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

/** Handle incoming Telegram bot update (webhook) */
export async function handleTelegramUpdate(update: TgUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Handle /start with invite deep link: /start invite_TOKEN
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const param = parts[1]; // e.g. "invite_abc123..."

    if (param?.startsWith('invite_')) {
      const inviteToken = param.slice('invite_'.length);
      const webAppUrl = `${WEB_APP_URL}/invite/${inviteToken}`;
      const name = msg.from?.first_name || '';

      console.log(`[TG Bot] /start invite from chat ${chatId}, token: ${inviteToken.slice(0, 8)}...`);

      await sendTelegramMessage(
        chatId,
        `👋 ${name ? name + ', w' : 'W'}elcome to <b>Social Organizer</b>!\n\nYou've been invited to join a trusted support network.\nTap the button below to accept the invitation.\n\n🌐 <a href="https://www.orginizer.com/">Learn more</a>`,
        {
          inline_keyboard: [[{ text: '🤝 Accept Invitation', web_app: { url: webAppUrl } }]],
        },
      );
      return;
    }

    // Plain /start — open the app + link to landing
    const name = msg.from?.first_name || '';
    await sendTelegramMessage(
      chatId,
      `👋 ${name ? name + ', w' : 'W'}elcome to <b>Social Organizer</b>!\n\nA platform for mutual support through trusted networks.\n\n🌐 <a href="https://www.orginizer.com/">Learn more about the project</a>`,
      {
        inline_keyboard: [[{ text: '📱 Open App', web_app: { url: WEB_APP_URL } }]],
      },
    );
    return;
  }

  // Forward any non-command text to the support chat
  const from = msg.from;
  const userName = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || 'Unknown';
  const userTag = from?.username ? ` (@${from.username})` : '';
  const userId = from?.id ? ` [${from.id}]` : '';

  await sendTelegramMessage(
    SUPPORT_CHAT_ID,
    `💬 <b>Message from user</b>\n\n👤 ${userName}${userTag}${userId}\n\n${text}`,
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
  formData.append('caption', `[Broadcast upload] ${filename}`);

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

/** Register webhook URL with Telegram Bot API */
export async function setTelegramWebhook(webhookUrl: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('[TG Bot] No TELEGRAM_BOT_TOKEN, skipping webhook setup');
    return false;
  }

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message'] }),
  });

  const json = (await res.json()) as TgApiResponse;
  if (json.ok) {
    console.log(`[TG Bot] Webhook set to ${webhookUrl}`);
  } else {
    console.error(`[TG Bot] setWebhook failed: ${json.description}`);
  }
  return json.ok;
}
