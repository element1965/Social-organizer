const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

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
    from?: { first_name?: string };
  };
}

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
        `👋 ${name ? name + ', w' : 'W'}elcome to <b>Social Organizer</b>!\n\nYou've been invited to join a trusted support network.\nTap the button below to accept the invitation.`,
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
      `👋 ${name ? name + ', w' : 'W'}elcome to <b>Social Organizer</b>!\n\nA platform for mutual support through trusted networks.\n\n🌐 <a href="${WEB_APP_URL}/welcome">Learn more about the project</a>`,
      {
        inline_keyboard: [[{ text: '📱 Open App', web_app: { url: WEB_APP_URL } }]],
      },
    );
    return;
  }
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
