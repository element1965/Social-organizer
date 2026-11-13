import { createHash, createHmac, timingSafeEqual } from 'crypto';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const INIT_DATA_MAX_AGE_SECONDS = 5 * 60; // 5 minutes

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  is_premium?: boolean;
}

export function validateTelegramInitData(initData: string): TelegramUserData | null {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[Telegram] TELEGRAM_BOT_TOKEN not set, cannot validate initData');
    return null;
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      console.error('[Telegram] no hash in initData');
      return null;
    }

    // Remove hash from params for verification
    params.delete('hash');

    // Sort params alphabetically and build check string
    const entries = Array.from(params.entries());
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

    // HMAC-SHA256: secret_key = HMAC_SHA256("WebAppData", bot_token)
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(TELEGRAM_BOT_TOKEN)
      .digest();

    const computedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) {
      console.error('[Telegram] initData hash mismatch');
      return null;
    }

    // Check auth_date freshness
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > INIT_DATA_MAX_AGE_SECONDS) {
      console.error('[Telegram] initData expired, age:', now - authDate, 'seconds');
      return null;
    }

    // Parse user data
    const userStr = params.get('user');
    if (!userStr) return null;

    const user = JSON.parse(userStr) as TelegramUserData;
    if (!user.id) return null;

    return user;
  } catch {
    return null;
  }
}

/** Fields the Telegram Login Widget passes to its callback (https://core.telegram.org/widgets/login). */
export interface TelegramWidgetAuth {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const WIDGET_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Verifies Telegram Login Widget data on the server (SO-21):
 * secret = SHA256(bot_token), hash = HMAC_SHA256(data_check_string, secret).
 * A bare Telegram id from the client is never accepted as proof.
 */
export function validateTelegramWidget(data: TelegramWidgetAuth): TelegramUserData | null {
  if (!TELEGRAM_BOT_TOKEN || !data?.hash || !data.id) return null;
  const entries = Object.entries(data)
    .filter(([k, v]) => k !== 'hash' && v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest();
  const computed = Buffer.from(createHmac('sha256', secret).update(dataCheckString).digest('hex'), 'hex');
  const given = Buffer.from(String(data.hash), 'hex');
  if (given.length !== computed.length || !timingSafeEqual(given, computed)) {
    console.error('[Telegram] widget hash mismatch');
    return null;
  }
  if (Math.floor(Date.now() / 1000) - Number(data.auth_date) > WIDGET_MAX_AGE_SECONDS) return null;
  return {
    id: Number(data.id),
    first_name: data.first_name,
    last_name: data.last_name,
    username: data.username,
    photo_url: data.photo_url,
  };
}

/** The web sign-in button needs the bot's domain set in BotFather; until then it stays off. */
/** The bot's numeric id: the public part of the token before ":" (also visible as the bot's user id). */
export function telegramBotId(): number | null {
  const id = Number(TELEGRAM_BOT_TOKEN.split(':')[0]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isTelegramWidgetEnabled(): boolean {
  return !!TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_LOGIN_WIDGET === '1';
}
