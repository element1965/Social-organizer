import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import { appRouter, type AppRouter } from './routers/index.js';
import { createContext } from './context.js';
import { setupQueues } from './workers/index.js';
import { handleTelegramUpdate, setTelegramWebhook, uploadMediaToTelegram } from './services/telegram-bot.service.js';
import { isAdmin } from './admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = Fastify({ logger: true, maxParamLength: 5000 });

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Path to built web frontend
// In production (Railway) — copied to dist/public during build
// In dev — directly in apps/web/dist
const WEB_DIST = existsSync(resolve(__dirname, 'public'))
  ? resolve(__dirname, 'public')
  : resolve(__dirname, '../../web/dist');

async function start() {
  try {
    // CORS
    await app.register(cors, { origin: true });

    // Multipart (file uploads, 50MB limit)
    await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

    // tRPC
    await app.register(fastifyTRPCPlugin, {
      prefix: '/trpc',
      trpcOptions: {
        router: appRouter,
        createContext,
        onError({ error }) {
          console.error('tRPC error:', error.message);
        },
      } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
    });

    // Health check
    app.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Telegram Bot webhook — receives /start commands
    app.post('/api/telegram-webhook', async (req, reply) => {
      try {
        await handleTelegramUpdate(req.body as Parameters<typeof handleTelegramUpdate>[0]);
      } catch (err) {
        console.error('[TG Webhook] error:', err);
      }
      return reply.send({ ok: true });
    });

    // Broadcast file upload — admin only (extended timeout for large videos)
    app.post('/api/broadcast/upload', { config: { rawBody: false } }, async (req, reply) => {
      // Extend timeout for large file uploads (3 minutes)
      req.raw.setTimeout(180_000);
      reply.raw.setTimeout(180_000);

      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'Unauthorized' });
      let userId: string | null = null;
      try {
        const token = auth.slice(7);
        const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64').toString());
        userId = payload.sub ?? null;
      } catch { /* invalid token */ }
      if (!userId || !isAdmin(userId)) return reply.status(403).send({ error: 'Forbidden' });

      let data;
      try {
        data = await req.file();
      } catch (err) {
        console.error('[Upload] file parse error:', err);
        return reply.status(400).send({ error: `File parse error: ${(err as Error).message}` });
      }
      if (!data) return reply.status(400).send({ error: 'No file' });

      let buffer: Buffer;
      try {
        buffer = await data.toBuffer();
      } catch (err) {
        console.error('[Upload] toBuffer error:', err);
        return reply.status(413).send({ error: `File too large or read error: ${(err as Error).message}` });
      }

      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
      const mediaType = data.mimetype.startsWith('video/') ? 'video' as const : 'photo' as const;
      console.log(`[Upload] ${mediaType} ${data.filename} (${sizeMB}MB)`);

      if (buffer.length > 50 * 1024 * 1024) {
        return reply.status(413).send({ error: `File too large (${sizeMB}MB). Telegram limit: 50MB` });
      }

      const fileId = await uploadMediaToTelegram(buffer, data.filename || 'media', mediaType);
      if (!fileId) return reply.status(500).send({ error: 'Upload to Telegram failed — check server logs' });

      return { fileId, mediaType };
    });

    // Serve web frontend (if dist exists)
    if (existsSync(WEB_DIST)) {
      await app.register(fastifyStatic, {
        root: WEB_DIST,
        prefix: '/',
        wildcard: false,
      });

      // SPA fallback: all non-API routes → index.html
      app.setNotFoundHandler((_req, reply) => {
        reply.sendFile('index.html', WEB_DIST);
      });

      console.log(`Serving web frontend from ${WEB_DIST}`);
    }

    // BullMQ workers (only if Redis is available)
    if (process.env.REDIS_URL) {
      try {
        setupQueues();
        console.log('BullMQ workers started');
      } catch (err) {
        console.warn('BullMQ init failed (Redis may be unavailable):', err);
      }
    }

    await app.listen({ port: PORT, host: HOST });
    console.log(`API server running on http://${HOST}:${PORT}`);

    // Startup diagnostics
    const hasBotToken = !!process.env.TELEGRAM_BOT_TOKEN;
    const hasFeedbackChat = !!process.env.FEEDBACK_CHAT_ID;
    const hasRedis = !!process.env.REDIS_URL;
    console.log(`[Startup] TELEGRAM_BOT_TOKEN: ${hasBotToken ? 'set' : 'MISSING'}, FEEDBACK_CHAT_ID: ${hasFeedbackChat ? 'set' : 'MISSING'}, REDIS_URL: ${hasRedis ? 'set' : 'MISSING'}`);

    // Register Telegram webhook (fire-and-forget)
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.WEB_APP_URL) {
      setTelegramWebhook(`${process.env.WEB_APP_URL}/api/telegram-webhook`).catch(() => {});
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
