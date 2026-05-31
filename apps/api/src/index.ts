import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyReply } from 'fastify';
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
import { verifyAppleIdToken, findOrCreateAppleUser } from './services/apple.service.js';
import { getDb } from '@so/db';
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

const APP_BASE_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

// Bounce the Apple Sign In result back to the client.
// - web: 302 to the SPA with tokens in the URL fragment (kept out of server logs)
// - native iOS: custom-scheme deep link (opens the app, closes SFSafariViewController)
// - native Android: intent:// deep link (closes the Chrome Custom Tab)
function appleRedirect(
  reply: FastifyReply,
  platform: string,
  tokens: { accessToken: string; refreshToken: string; userId: string; isNew: boolean } | null,
) {
  if (!tokens) {
    if (platform === 'ios') return appleHtmlRedirect(reply, 'socialorganizer://auth-error');
    if (platform === 'android') {
      const fb = encodeURIComponent(`${APP_BASE_URL}/login`);
      return appleHtmlRedirect(reply, `intent://auth-error#Intent;scheme=socialorganizer;package=com.socialorganizer.app;S.browser_fallback_url=${fb};end`);
    }
    return reply.redirect(`${APP_BASE_URL}/login`, 302);
  }

  const params = new URLSearchParams({
    at: tokens.accessToken,
    rt: tokens.refreshToken,
    uid: tokens.userId,
    isNew: tokens.isNew ? '1' : '0',
  }).toString();

  if (platform === 'ios') {
    return appleHtmlRedirect(reply, `socialorganizer://auth-success?${params}`);
  }
  if (platform === 'android') {
    const fb = encodeURIComponent(APP_BASE_URL);
    return appleHtmlRedirect(reply, `intent://auth-success?${params}#Intent;scheme=socialorganizer;package=com.socialorganizer.app;S.browser_fallback_url=${fb};end`);
  }
  // web
  return reply.redirect(`${APP_BASE_URL}/auth/apple/done#${params}`, 302);
}

function appleHtmlRedirect(reply: FastifyReply, target: string) {
  reply.header('Content-Type', 'text/html; charset=utf-8');
  reply.header('Cache-Control', 'no-store');
  const safe = target.replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return reply.send(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Signing in…</title></head>` +
    `<body style="background:#0b1220;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui">` +
    `<p>Returning to the app…</p><script>window.location.href="${safe}";</script>` +
    `<noscript><a style="color:#2dd4bf" href="${safe}">Continue</a></noscript></body></html>`,
  );
}

async function start() {
  try {
    // CORS
    await app.register(cors, { origin: true });

    // Multipart (file uploads, 50MB limit)
    await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

    // Parse application/x-www-form-urlencoded (used by Apple Sign In form_post callback)
    app.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_req, body, done) => {
        try {
          done(null, Object.fromEntries(new URLSearchParams(body as string)));
        } catch (err) {
          done(err as Error);
        }
      },
    );

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

    // Sign in with Apple — domain verification file.
    // Apple requires hosting the association file at this exact path when configuring
    // the Services ID. Paste the file contents into the APPLE_DOMAIN_ASSOCIATION env var.
    app.get('/.well-known/apple-developer-domain-association.txt', async (_req, reply) => {
      const content = process.env.APPLE_DOMAIN_ASSOCIATION;
      if (!content) return reply.status(404).send('Not configured');
      reply.header('Content-Type', 'text/plain; charset=utf-8');
      return reply.send(content);
    });

    // Sign in with Apple — web OAuth callback (response_mode=form_post).
    // Apple POSTs here after the user authenticates in the system browser. We verify
    // the id_token, find/create the user, then bounce back to the app (native deep
    // link) or the web SPA (URL fragment) with our session tokens.
    app.post('/api/auth/apple/callback', async (req, reply) => {
      const body = (req.body || {}) as Record<string, string>;
      const idToken = body.id_token;

      let platform = 'web';
      let linkCode: string | undefined;
      try {
        const s = JSON.parse(body.state || '{}');
        platform = s.p || 'web';
        linkCode = s.lc || undefined;
      } catch { /* no/invalid state → treat as web */ }

      // Apple sends the user's name only on the FIRST authorization, as a JSON string.
      let displayName: string | null = null;
      try {
        if (body.user) {
          const u = JSON.parse(body.user) as { name?: { firstName?: string; lastName?: string } };
          if (u.name) displayName = [u.name.firstName, u.name.lastName].filter(Boolean).join(' ') || null;
        }
      } catch { /* ignore malformed user payload */ }

      const sendBack = (tokens: { accessToken: string; refreshToken: string; userId: string; isNew: boolean } | null) => {
        return appleRedirect(reply, platform, tokens);
      };

      if (!idToken) return sendBack(null);
      const apple = await verifyAppleIdToken(idToken);
      if (!apple) return sendBack(null);

      try {
        const result = await findOrCreateAppleUser(getDb(), apple, displayName, linkCode);
        return sendBack(result);
      } catch (err) {
        console.error('[Apple] login failed:', err);
        return sendBack(null);
      }
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
