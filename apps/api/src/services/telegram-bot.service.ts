const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

export interface TgReplyMarkup {
  inline_keyboard: Array<Array<{ text: string; url?: string; web_app?: { url: string } }>>;
}

interface TgApiResponse {
  ok: boolean;
  description?: string;
  parameters?: { retry_after?: number };
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
