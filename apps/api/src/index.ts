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
import { handleTelegramUpdate, setTelegramWebhook, uploadMediaToTelegram, getTelegramFileUrl } from './services/telegram-bot.service.js';
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

    // Manual auto-chain trigger — admin only, bypasses BullMQ
    app.post('/api/trigger-autochain', async (req, reply) => {
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'Unauthorized' });
      let userId: string | null = null;
      try {
        const token = auth.slice(7);
        const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64').toString());
        userId = payload.sub ?? null;
      } catch { /* invalid token */ }
      if (!userId || !isAdmin(userId)) return reply.status(403).send({ error: 'Forbidden' });

      try {
        const { processAutoChain } = await import('./workers/auto-chain.worker.js');
        await processAutoChain({ id: 'manual' } as never);
        return { ok: true, message: 'Auto-chain processed' };
      } catch (err) {
        console.error('[trigger-autochain] error:', err);
        return reply.status(500).send({ error: String(err) });
      }
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

    // Media proxy — serve Telegram-hosted files (FAQ images, etc.)
    app.get('/api/media/:fileId', async (req, reply) => {
      const { fileId } = req.params as { fileId: string };
      if (!fileId) return reply.status(400).send({ error: 'Missing fileId' });

      const url = await getTelegramFileUrl(fileId);
      if (!url) return reply.status(404).send({ error: 'File not found' });

      try {
        const response = await fetch(url);
        if (!response.ok) return reply.status(response.status).send({ error: 'Upstream error' });
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const buffer = Buffer.from(await response.arrayBuffer());
        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'public, max-age=604800'); // 7 days
        return reply.send(buffer);
      } catch {
        return reply.status(502).send({ error: 'Failed to fetch file' });
      }
    });

    // Image proxy — fetch external avatar images to bypass CORS (t.me doesn't send CORS headers)
    app.get('/api/image-proxy', async (req, reply) => {
      const url = (req.query as Record<string, string>).url;
      if (!url || (!url.startsWith('https://t.me/') && !url.startsWith('https://cdn'))) {
        return reply.status(400).send({ error: 'Invalid URL' });
      }
      try {
        const response = await fetch(url);
        if (!response.ok) return reply.status(response.status).send({ error: 'Upstream error' });
        const contentType = response.headers.get('content-type') || 'image/svg+xml';
        const buffer = Buffer.from(await response.arrayBuffer());
        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.send(buffer);
      } catch {
        return reply.status(502).send({ error: 'Fetch failed' });
      }
    });

    // Deep link trampoline — opens Instagram app to the correct profile
    // on Android (bypasses App Links interception that loses the path)
    app.get('/api/open/instagram/:username', async (req, reply) => {
      const username = (req.params as Record<string, string>).username?.replace(/[^a-zA-Z0-9._]/g, '');
      if (!username) return reply.status(400).send('Bad username');
      reply.header('Content-Type', 'text/html; charset=utf-8');
      reply.header('Cache-Control', 'no-store');
      const intentUri = `intent://user?username=${username}#Intent;scheme=instagram;package=com.instagram.android;S.browser_fallback_url=https%3A%2F%2Finstagram.com%2F${username};end`;
      return reply.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Opening Instagram...</title></head><body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui"><p>Opening @${username}...</p><script>var u=navigator.userAgent;if(/android/i.test(u)){window.location.href='${intentUri}'}else if(/iPhone|iPad/i.test(u)){window.location.href='instagram://user?username=${username}';setTimeout(function(){window.location.href='https://instagram.com/${username}'},1500)}else{window.location.href='https://instagram.com/${username}'}</script><noscript><a href="https://instagram.com/${username}">Open profile</a></noscript></body></html>`);
    });

    // Serve web frontend (if dist exists)
    if (existsSync(WEB_DIST)) {
      await app.register(fastifyStatic, {
        root: WEB_DIST,
        prefix: '/',
        wildcard: false,
        setHeaders(reply, filePath) {
          if (filePath.endsWith('.html')) {
            reply.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (filePath.includes('/assets/')) {
            reply.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      });

      // SPA fallback: all non-API routes → index.html
      app.setNotFoundHandler((_req, reply) => {
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
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

    // Gun.js relay — attach to the HTTP server for P2P graph backup sync between clients
    try {
      const Gun = (await import('gun')).default;
      Gun({ web: app.server, file: 'gun-data' });
      console.log('Gun.js relay started');
    } catch (err) {
      console.warn('Gun.js relay init failed:', err);
    }

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
