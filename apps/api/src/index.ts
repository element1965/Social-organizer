import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import { appRouter, type AppRouter } from './routers/index';
import { createContext } from './context';
import { setupQueues } from './workers/index';

const app = Fastify({ logger: true, maxParamLength: 5000 });

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

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
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
