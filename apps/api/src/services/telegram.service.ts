import { createHmac } from 'crypto';

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
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set, cannot validate initData');
    return null;
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

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

    if (computedHash !== hash) return null;

    // Check auth_date freshness
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > INIT_DATA_MAX_AGE_SECONDS) return null;

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
