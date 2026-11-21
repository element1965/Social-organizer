import type { FastifyInstance } from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { appRouter, type AppRouter } from './routers/index.js';
import { createContext } from './context.js';
import { MAX_AUTH_CALLS_PER_REQUEST } from './trpc.js';

/**
 * Sign-in procedures open to guessing (passwords, codes). Each call is charged against the per-IP sign-in limit
 * inside tRPC (authAttemptProcedure, 30 per 15 min), and one HTTP request may carry at most
 * MAX_AUTH_CALLS_PER_REQUEST of them (counted in the request's tRPC context, whatever the path encoding).
 * Signed flows (refresh, Telegram initData, Google) are left out so many users behind one carrier IP are not
 * locked out. The hook below only refuses an over-long batch early, before any call starts.
 */
const AUTH_PROCEDURES = new Set([
  'auth.registerWithEmail',
  'auth.loginWithEmail',
  'auth.loginWithLinkCode',
  'auth.claimWithLinkCode',
  'auth.requestEmailCode',
  'auth.verifyEmailCode',
]);

/** Procedure names of a tRPC request, decoded the way Fastify decodes the route parameter tRPC reads. */
function trpcProcedures(url: string): string[] {
  const raw = url.slice('/trpc/'.length).split('?')[0] ?? '';
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch { /* undecodable: Fastify refuses it as well */ }
  return path.split(',');
}

/** The tRPC API under /trpc, with the early batch check. `context` replaces the context factory in tests. */
export async function registerTrpcApi(app: FastifyInstance, context: typeof createContext = createContext): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/trpc/')) return;
    const authCalls = trpcProcedures(req.url).filter((p) => AUTH_PROCEDURES.has(p)).length;
    if (authCalls > MAX_AUTH_CALLS_PER_REQUEST) {
      return reply.status(400).send({ error: 'Too many sign-in calls in one request' });
    }
  });

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext: context,
      onError({ error }) {
        console.error('tRPC error:', error.message);
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });
}
