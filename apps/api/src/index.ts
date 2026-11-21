import { registerLandingEndpoints } from './services/landing.service.js';
import { linkLanguage, SUPPORTED_LANGUAGES } from '@so/i18n';
import { campaignFrom, isProductionWebRoute, type Campaign, publicPagePath, renderPublicSitemap, WEB_ROUTES } from '@so/shared';
import { WEB_APP_URL, WEB_APP_ALT_URL, ANDROID_APP_PACKAGE, APPLE_TEAM_ID, APPLE_BUNDLE_ID, NATIVE_AUTH_SCHEME } from './deployment.js';
import { hit, clientIp, MINUTE } from './services/rate-limit.service.js';
import { startGunRelay } from './gun-relay.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { registerTrpcApi } from './trpc-http.js';
import { setupQueues } from './workers/index.js';
import { handleTelegramUpdate, setTelegramWebhook, uploadMediaToTelegram, getTelegramFileUrl } from './services/telegram-bot.service.js';
import { registerTelegramWebhook } from './services/telegram-webhook.js';
import { fetchAvatarImage } from './services/image-proxy.service.js';
import { activeAdminFromAuthHeader } from './services/admin-session.js';
import { verifyAppleIdToken, findOrCreateAppleUser } from './services/apple.service.js';
import { AccountExistsError } from './services/identity.service.js';
import { backfillBotStartInvites } from './services/invite-fallback.service.js';
import { getDb } from '@so/db';
import { logMailConfig } from './services/mail.service.js';
import { startInactiveCleanupTimer, logInactiveCleanupConfig } from './services/inactive-cleanup.service.js';
import { readAvatar, backfillAvatars } from './services/avatar.service.js';
import { countRequest, startRuntimeMetrics } from './services/runtime-metrics.service.js';
import { findInvitePreview, findSosPreview, pickLanguage, renderInvitePreview, renderSosPreview, renderHtmlLanguage, renderPublicPage, renderMissingPage } from './services/invite-preview.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/** An admin token of an account that still exists and is not deleted (SEC-8), issued after its first mailbox proof (SEC-1). */
function activeAdminFromRequest(req: FastifyRequest): Promise<{ userId: string } | { status: 401 | 403 }> {
  return activeAdminFromAuthHeader(getDb(), req.headers.authorization);
}

const app = Fastify({ logger: true, maxParamLength: 5000 });

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Path to built web frontend
// In production (Railway) — copied to dist/public during build
// In dev — directly in apps/web/dist
const WEB_DIST = existsSync(resolve(__dirname, 'public'))
  ? resolve(__dirname, 'public')
  : resolve(__dirname, '../../web/dist');

const SITE_FILES = new Set([
  '/favicon.ico', '/apple-touch-icon.png', '/robots.txt', '/sitemap.xml', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/push-badge.png', '/og-image.png',
]);

// Bounce the Apple Sign In result back to the client.
// - web: 302 to the SPA with tokens in the URL fragment (kept out of server logs)
// - native iOS: custom-scheme deep link (opens the app, closes SFSafariViewController)
// - native Android: intent:// deep link (closes the Chrome Custom Tab)
function appleRedirect(
  reply: FastifyReply,
  platform: string,
  tokens: { accessToken: string; refreshToken: string; userId: string; isNew: boolean } | null,
  invite?: string,
  reason: 'failed' | 'account_exists' | 'cancelled' = 'failed',
  /** Masked e-mail of the existing account (account_exists only); never the full address. */
  maskedEmail?: string | null,
) {
  if (!tokens) {
    // The reason lets the sign-in screen show the next step (SO-21). Older clients treat any unknown reason
    // as "failed", so "cancelled" and the extra "m" parameter are backward compatible.
    const extra = maskedEmail ? `&m=${encodeURIComponent(maskedEmail)}` : '';
    if (platform === 'ios') return appleHtmlRedirect(reply, `${NATIVE_AUTH_SCHEME}://auth-error?reason=${reason}${extra}`);
    if (platform === 'android') {
      const fb = encodeURIComponent(`${WEB_APP_URL}/login?error=${reason}${extra}`);
      return appleHtmlRedirect(reply, `intent://auth-error?reason=${reason}${extra}#Intent;scheme=${NATIVE_AUTH_SCHEME};package=${ANDROID_APP_PACKAGE};S.browser_fallback_url=${fb};end`);
    }
    return reply.redirect(`${WEB_APP_URL}/login?error=${reason}${extra}`, 302);
  }

  const params = new URLSearchParams({
    at: tokens.accessToken,
    rt: tokens.refreshToken,
    uid: tokens.userId,
    isNew: tokens.isNew ? '1' : '0',
    ...(invite ? { inv: invite } : {}),
  }).toString();

  if (platform === 'ios') {
    return appleHtmlRedirect(reply, `${NATIVE_AUTH_SCHEME}://auth-success?${params}`);
  }
  if (platform === 'android') {
    const fb = encodeURIComponent(WEB_APP_URL);
    return appleHtmlRedirect(reply, `intent://auth-success?${params}#Intent;scheme=${NATIVE_AUTH_SCHEME};package=${ANDROID_APP_PACKAGE};S.browser_fallback_url=${fb};end`);
  }
  // web
  return reply.redirect(`${WEB_APP_URL}/auth/apple/done#${params}`, 302);
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
    // CORS: only our own web/app origins (the app is served from the same domain) (SO-14)
    const allowedOrigins = new Set([
      new URL(WEB_APP_URL).origin,
      ...(WEB_APP_ALT_URL ? [new URL(WEB_APP_ALT_URL).origin] : []),
      'capacitor://localhost',
      'https://localhost',
      'http://localhost:3000',
    ]);
    await app.register(cors, {
      origin: (origin, cb) => cb(null, !origin || allowedOrigins.has(origin)),
    });

    // Compressed answers (gzip/brotli) for JSON and text over 1 KB: lists of people shrink several times.
    // Pictures and video are already compressed and are left alone.
    await app.register(compress, { global: true, threshold: 1024, encodings: ['br', 'gzip'] });

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

    // Rate limits (SO-14): strict on sign-in procedures, a calm global cap on everything else
    app.addHook('onRequest', async () => {
      countRequest();
    });
    app.addHook('onRequest', async (req, reply) => {
      const ip = clientIp(req.raw);
      // Profile photos are small, cached for good and come hundreds at a time when a large circle opens
      if (req.url.startsWith('/api/avatar/')) return;
      if (!hit(`all:${ip}`, 600, MINUTE)) {
        return reply.status(429).send({ error: 'Too many requests' });
      }
    });

    // tRPC (with the cap on sign-in calls per request, trpc-http.ts)
    await registerTrpcApi(app);

    registerLandingEndpoints(app);

    // Health check
    app.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Manual auto-chain trigger — admin only, bypasses BullMQ
    app.post('/api/trigger-autochain', async (req, reply) => {
      const admin = await activeAdminFromRequest(req);
      if ('status' in admin) return reply.status(admin.status).send({ error: admin.status === 401 ? 'Unauthorized' : 'Forbidden' });

      try {
        const { processAutoChain } = await import('./workers/auto-chain.worker.js');
        await processAutoChain({ id: 'manual' } as never);
        return { ok: true, message: 'Auto-chain processed' };
      } catch (err) {
        console.error('[trigger-autochain] error:', err);
        return reply.status(500).send({ error: String(err) });
      }
    });

    // Telegram Bot webhook — receives /start commands. Off (404) when no bot token is set (SEC-9).
    registerTelegramWebhook(app, {
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
      handle: (update) => handleTelegramUpdate(update as Parameters<typeof handleTelegramUpdate>[0]),
    });

    // Broadcast file upload — admin only (extended timeout for large videos)
    app.post('/api/broadcast/upload', { config: { rawBody: false } }, async (req, reply) => {
      // Extend timeout for large file uploads (3 minutes)
      req.raw.setTimeout(180_000);
      reply.raw.setTimeout(180_000);

      const admin = await activeAdminFromRequest(req);
      if ('status' in admin) return reply.status(admin.status).send({ error: admin.status === 401 ? 'Unauthorized' : 'Forbidden' });

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
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Cache-Control', 'public, max-age=604800'); // 7 days
        return reply.send(buffer);
      } catch {
        return reply.status(502).send({ error: 'Failed to fetch file' });
      }
    });

    // Image proxy — fetch external avatar images to bypass CORS (t.me doesn't send CORS headers).
    // Only known avatar hosts (every redirect hop too), only images, size-capped — not an open proxy (SO-14).
    app.get('/api/image-proxy', async (req, reply) => {
      try {
        const result = await fetchAvatarImage((req.query as Record<string, string>).url);
        if (!result.ok) return reply.status(result.status).send({ error: result.error });
        reply.header('Content-Type', result.contentType);
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.send(result.body);
      } catch {
        return reply.status(502).send({ error: 'Fetch failed' });
      }
    });

    // Uploaded profile photos. The hash in the address changes with the photo, so the answer never
    // goes stale and the browser keeps it; lists of people carry only this short address.
    app.get('/api/avatar/:userId/:hash', async (req, reply) => {
      const { userId, hash } = req.params as { userId: string; hash: string };
      if (!/^[a-f0-9]{32}$/.test(hash)) return reply.status(404).send({ error: 'Not found' });
      try {
        const avatar = await readAvatar(getDb(), userId, hash);
        if (!avatar) return reply.status(404).send({ error: 'Not found' });
        reply.header('Content-Type', avatar.mime);
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        return reply.send(avatar.data);
      } catch {
        return reply.status(404).send({ error: 'Not found' });
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

    // Android App Links: lets Android open /invite/ links (camera, Lens, messengers) straight in the app.
    // ANDROID_CERT_SHA256: comma-separated SHA-256 signing-cert fingerprints (production: the Play App Signing
    // key from Play Console → App integrity). ANDROID_APP_PACKAGE: defaults to the store package; the staging
    // environment points it at com.socialorganizer.app.staging.
    app.get('/.well-known/assetlinks.json', async (_req, reply) => {
      const fingerprints = (process.env.ANDROID_CERT_SHA256 || '')
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
      if (fingerprints.length === 0) return reply.status(404).send('Not configured');
      reply.header('Content-Type', 'application/json');
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: ANDROID_APP_PACKAGE,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]);
    });

    // iOS Universal Links: the same links as the Android App Links above open the installed app
    // (camera QR, messengers, Safari). The app declares applinks:<host> in App.entitlements.
    // APPLE_TEAM_ID defaults to the team in the Xcode project, APPLE_BUNDLE_ID to the store bundle.
    const appleAppSiteAssociation = async (_req: unknown, reply: import('fastify').FastifyReply) => {
      const appId = `${APPLE_TEAM_ID}.${APPLE_BUNDLE_ID}`;
      const paths = ['/invite/*', '/i/*', '/sos/*'];
      reply.header('Content-Type', 'application/json');
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send({
        applinks: {
          apps: [],
          details: [{ appIDs: [appId], appID: appId, components: paths.map((path) => ({ '/': path })), paths }],
        },
      });
    };
    app.get('/.well-known/apple-app-site-association', appleAppSiteAssociation);
    app.get('/apple-app-site-association', appleAppSiteAssociation);

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
      let invite: string | undefined;
      let campaign: Campaign | undefined;
      try {
        const s = JSON.parse(body.state || '{}');
        platform = s.p || 'web';
        linkCode = s.lc || undefined;
        invite = s.inv || undefined;
        campaign = campaignFrom(s.campaign);
      } catch { /* no/invalid state → treat as web */ }

      // Apple sends the user's name only on the FIRST authorization, as a JSON string.
      let displayName: string | null = null;
      try {
        if (body.user) {
          const u = JSON.parse(body.user) as { name?: { firstName?: string; lastName?: string } };
          if (u.name) displayName = [u.name.firstName, u.name.lastName].filter(Boolean).join(' ') || null;
        }
      } catch { /* ignore malformed user payload */ }

      const sendBack = (
        tokens: { accessToken: string; refreshToken: string; userId: string; isNew: boolean } | null,
        reason?: 'failed' | 'account_exists' | 'cancelled',
        maskedEmail?: string | null,
      ) => {
        return appleRedirect(reply, platform, tokens, invite, reason, maskedEmail);
      };

      // The person closed the Apple sheet: not an error, the sign-in screen says so calmly
      if (body.error === 'user_cancelled_authorize') return sendBack(null, 'cancelled');
      if (!idToken) return sendBack(null);
      const apple = await verifyAppleIdToken(idToken);
      if (!apple) return sendBack(null);

      try {
        const result = await findOrCreateAppleUser(getDb(), apple, displayName, linkCode, [`ip:${clientIp(req.raw)}`], campaign);
        return sendBack(result);
      } catch (err) {
        if (err instanceof AccountExistsError) return sendBack(null, 'account_exists', err.maskedEmail);
        console.error('[Apple] login failed:', err);
        return sendBack(null);
      }
    });

    // Serve web frontend (if dist exists)
    if (existsSync(WEB_DIST)) {
      // The old ?invite= entry point can also be shared on the landing and How pages.
      app.addHook('onRequest', async (req, reply) => {
        const [path, query] = req.url.split('?', 2);
        if ((path === '/' || path === '/how') && new URLSearchParams(query).has('invite')) {
          reply.header('X-Robots-Tag', 'noindex');
        }
      });
      const sitemap = renderPublicSitemap(WEB_APP_URL, SUPPORTED_LANGUAGES);
      app.get('/sitemap.xml', (_req, reply) =>
        reply.header('Cache-Control', 'public, max-age=600').type('application/xml; charset=utf-8').send(sitemap));
      await app.register(fastifyStatic, {
        root: WEB_DIST,
        prefix: '/',
        wildcard: false,
        globIgnore: ['sitemap.xml'],
        index: false,
        setHeaders(reply, filePath) {
          if (filePath.endsWith('.html')) {
            reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (/[\\/]assets[\\/]/.test(filePath)) {
            reply.header('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (/[\\/]videos[\\/]/.test(filePath)) {
            // Instruction videos: not content-hashed, versioned by ?v= in the client
            reply.header('Cache-Control', 'public, max-age=2592000');
          }
        },
      });

      // Personal invite pages carry the inviter's name and photo in the HTML itself (SO-24):
      // messengers build the link card without running JavaScript. Reading a preview creates nothing.
      const indexHtmlPath = resolve(WEB_DIST, 'index.html');
      let indexHtml: string | null = null;
      const readIndex = async () => indexHtml ??= await readFile(indexHtmlPath, 'utf8');
      const version = (req: FastifyRequest, fallback = 'en') => {
        const query = new URLSearchParams(req.url.split('?')[1]);
        return { lang: pickLanguage(query.get('lang'), req.headers['accept-language'], fallback), explicit: linkLanguage(query.get('lang')) };
      };
      const localizedShell = async (req: FastifyRequest) => renderHtmlLanguage(await readIndex(), version(req).lang);
      const sendSpa = (reply: FastifyReply, html: string, status = 200) =>
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
          .type('text/html; charset=utf-8').code(status).send(html);

      const serveInvite = async (req: FastifyRequest, reply: FastifyReply, token: string) => {
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        reply.header('X-Robots-Tag', 'noindex');
        try {
          const preview = await findInvitePreview(getDb(), token);
          if (preview) {
            const { lang, explicit } = version(req, preview.language);
            const q = new URLSearchParams(req.url.split('?')[1]);
            const url = new URL(req.url.split('?')[0]!, WEB_APP_URL);
            if (explicit) url.searchParams.set('lang', explicit);
            return sendSpa(reply, renderInvitePreview(await readIndex(), preview, {
              lang, url: url.href, origin: WEB_APP_URL, to: q.get('to'),
            }));
          }
        } catch (err) {
          req.log.warn({ err }, '[invite-preview] failed, serving the plain page');
        }
        return sendSpa(reply, await localizedShell(req));
      };

      app.get(WEB_ROUTES.INVITE, (req, reply) => serveInvite(req, reply, (req.params as { token: string }).token));
      app.get(WEB_ROUTES.INVITE_SLUG, (req, reply) => serveInvite(req, reply, (req.params as { slug: string }).slug));

      // Public Need cards include only the author's name and photo.
      app.get(WEB_ROUTES.SOS, async (req, reply) => {
        reply.header('X-Robots-Tag', 'noindex');
        const path = req.url.split('?')[0]!;
        if (!isProductionWebRoute(path)) return sendSpa(reply, renderMissingPage(await readIndex(), version(req).lang, WEB_APP_URL), 404);
        try {
          const preview = await findSosPreview(getDb(), (req.params as { collectionId: string }).collectionId);
          if (preview) {
            const { lang, explicit } = version(req, preview.language);
            const url = new URL(path, WEB_APP_URL);
            if (explicit) url.searchParams.set('lang', explicit);
            return sendSpa(reply, renderSosPreview(await readIndex(), preview, { lang, url: url.href, origin: WEB_APP_URL }));
          }
        } catch (err) {
          req.log.warn({ err }, '[sos-preview] failed, serving the plain page');
        }
        return sendSpa(reply, await localizedShell(req));
      });

      app.setNotFoundHandler(async (req, reply) => {
        const path = req.url.split('?')[0]!;
        if ((req.method !== 'GET' && req.method !== 'HEAD') || SITE_FILES.has(path) ||
          /^\/(?:api|trpc|\.well-known|assets|landing|fonts|videos|gun)(?:\/|$)/i.test(path)) {
          return reply.code(404).send({ error: 'Not found' });
        }
        const publicPath = publicPagePath(path);
        if (publicPath) {
          const { lang, explicit } = version(req);
          reply.header('Vary', 'Accept-Language');
          return sendSpa(reply, renderPublicPage(await readIndex(), publicPath, WEB_APP_URL, lang, explicit));
        }
        if (isProductionWebRoute(path)) return sendSpa(reply, await localizedShell(req));
        reply.header('X-Robots-Tag', 'noindex');
        return sendSpa(reply, renderMissingPage(await readIndex(), version(req).lang, WEB_APP_URL), 404);
      });

      console.log(`Serving web frontend from ${WEB_DIST}`);
    }

    // BullMQ workers (only if Redis is available)
    let queuesStarted = false;
    if (process.env.REDIS_URL) {
      try {
        setupQueues();
        queuesStarted = true;
        console.log('BullMQ workers started');
      } catch (err) {
        console.warn('BullMQ init failed (Redis may be unavailable):', err);
      }
    }
    // Without BullMQ the daily inactive-account cleanup runs on an in-process timer
    // (an advisory lock keeps it to one run at a time across replicas)
    if (!queuesStarted) {
      startInactiveCleanupTimer(getDb());
    }
    logInactiveCleanupConfig();

    await app.listen({ port: PORT, host: HOST });
    // One line a minute: event loop, memory, the graph and walk timings (see the scale steps of the launch plan)
    startRuntimeMetrics();
    console.log(`API server running on http://${HOST}:${PORT}`);

    // Gun.js relay — attach to the HTTP server for P2P graph backup sync between clients
    try {
      await startGunRelay(app.server);
      console.log('Gun.js relay started (token required)');
    } catch (err) {
      console.warn('Gun.js relay init failed:', err);
    }

    if (!process.env.REDIS_URL) console.log('[Redis] REDIS_URL is unset. BullMQ workers are disabled.');
    if (!process.env.TELEGRAM_BOT_TOKEN) console.log('[Telegram] TELEGRAM_BOT_TOKEN is unset. Telegram sign-in and delivery are disabled.');
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) console.log('[FCM] FIREBASE_SERVICE_ACCOUNT is unset. Android push is disabled.');
    logMailConfig();

    // Register Telegram webhook (fire-and-forget)
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.WEB_APP_URL) {
      setTelegramWebhook(`${process.env.WEB_APP_URL}/api/telegram-webhook`).catch(() => {});
    }

    // Photos stored the old way (data URL inside users.photoUrl) move to their own table
    backfillAvatars(getDb()).catch((err) => {
      console.error('[Startup] avatar backfill failed:', err);
    });

    // Backfill invites lost by the mini app (fire-and-forget, consumes tokens on apply)
    backfillBotStartInvites(getDb()).catch((err) => {
      console.error('[Startup] invite backfill failed:', err);
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
