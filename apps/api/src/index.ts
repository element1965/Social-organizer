import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import { appRouter, type AppRouter } from './routers/index.js';
import { createContext } from './context.js';
import { setupQueues } from './workers/index.js';

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
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
