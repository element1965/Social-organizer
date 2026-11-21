import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerTelegramWebhook, webhookSecretFor } from '../src/services/telegram-webhook.js';

let app: ReturnType<typeof Fastify> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

function serve(botToken: string) {
  const handle = vi.fn(async () => {});
  app = Fastify();
  registerTelegramWebhook(app, { botToken, handle });
  return handle;
}

const update = { update_id: 1, callback_query: { id: '1', from: { id: 42 }, data: 'accept:x' } };

function post(secret?: string) {
  return app!.inject({
    method: 'POST',
    url: '/api/telegram-webhook',
    payload: update,
    headers: secret === undefined ? {} : { 'x-telegram-bot-api-secret-token': secret },
  });
}

describe('Telegram webhook', () => {
  it.each([['unset', ''], ['blank', '   ']])('is off when the bot token is %s, even with the derived secret', async (_label, token) => {
    const handle = serve(token);
    for (const secret of [undefined, '', webhookSecretFor(''), webhookSecretFor(token)]) {
      expect((await post(secret)).statusCode).toBe(404);
    }
    expect(handle).not.toHaveBeenCalled();
  });

  it('accepts only the secret derived from the configured token', async () => {
    const handle = serve('123456:configured-token');
    expect((await post()).statusCode).toBe(401);
    expect((await post(webhookSecretFor(''))).statusCode).toBe(401);
    expect((await post(webhookSecretFor('other'))).statusCode).toBe(401);
    expect(handle).not.toHaveBeenCalled();

    const ok = await post(webhookSecretFor('123456:configured-token'));
    expect(ok.statusCode).toBe(200);
    expect(handle).toHaveBeenCalledWith(update);
  });
});
