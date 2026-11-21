import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

/**
 * Secret Telegram sends back in X-Telegram-Bot-Api-Secret-Token on every webhook call (SO-14).
 * Derived from the bot token, so no extra env var; changes together with the token.
 */
export function webhookSecretFor(botToken: string): string {
  return createHash('sha256').update(`so-webhook:${botToken}`).digest('hex');
}

function sameSecret(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface TelegramWebhookOptions {
  /** The bot token this server runs with; empty when Telegram is off. */
  botToken: string;
  handle: (update: unknown) => Promise<void>;
}

/**
 * POST /api/telegram-webhook. Without a bot token there is no webhook at all (SEC-9): the secret would be
 * derived from an empty token and anyone could compute it. Both refusals run in onRequest, before the body
 * is parsed or anything is handled.
 */
export function registerTelegramWebhook(app: FastifyInstance, { botToken, handle }: TelegramWebhookOptions): void {
  const enabled = botToken.trim().length > 0;
  const secret = enabled ? webhookSecretFor(botToken) : '';
  app.post('/api/telegram-webhook', {
    onRequest: async (req, reply) => {
      if (!enabled) return reply.status(404).send({ ok: false });
      if (!sameSecret(req.headers['x-telegram-bot-api-secret-token'], secret)) {
        return reply.status(401).send({ ok: false });
      }
    },
  }, async (req, reply) => {
    try {
      await handle(req.body);
    } catch (err) {
      console.error('[TG Webhook] error:', err);
    }
    return reply.send({ ok: true });
  });
}
