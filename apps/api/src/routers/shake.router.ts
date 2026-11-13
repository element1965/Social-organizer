import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@so/db';
import { router, protectedProcedure } from '../trpc.js';
import { hit, MINUTE } from '../services/rate-limit.service.js';
import { connectInPersonTx } from '../services/connection-request.service.js';
import { syncMilestonesForPair } from '../services/milestone.service.js';
import { scanMatchesForUser } from '../services/match-notification.service.js';
import {
  registerShake,
  getShakeStatus,
  getTicketOwner,
  getPair,
  recordResponse,
  finishPair,
  type PairState,
  type ShakePair,
} from '../services/shake.service.js';

export type ShakeMatched = {
  state: 'matched';
  pairId: string;
  /** Null on a weak pair until both confirmed the code: nobody learns who the other is before that */
  person: { id: string; name: string; photoUrl: string | null } | null;
  /** Paired without a shared network or close geo: compare the code before anything else */
  weak: boolean;
  code: string[];
  alreadyConnected: boolean;
  iAccepted: boolean;
  otherAccepted: boolean;
  pairState: PairState;
  error?: string;
};

export type ShakeStatus =
  | { state: 'searching' }
  | { state: 'none' }
  | { state: 'crowded' }
  | ShakeMatched;

async function describeMatch(db: PrismaClient, userId: string, pair: ShakePair): Promise<ShakeMatched | null> {
  const otherId = pair.users[0] === userId ? pair.users[1] : pair.users[0];
  const other = await db.user.findUnique({
    where: { id: otherId },
    select: { id: true, name: true, photoUrl: true, deletedAt: true },
  });
  if (!other || other.deletedAt) return null;
  // Read once, before anyone answers: after this shake connects them, they must not look "already connected"
  if (pair.connectedBefore === undefined && pair.state === 'waiting' && !pair.connecting && pair.accepted.size < 2) {
    const [userAId, userBId] = [userId, otherId].sort();
    const connection = await db.connection.findUnique({
      where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
      select: { id: true },
    });
    pair.connectedBefore = !!connection;
  }
  // A limit message is worded for the person who hit it; the other one sees it the other way round
  let error = pair.error;
  if (error && pair.errorFor && pair.errorFor !== userId) {
    if (error === 'CONNECTION_LIMIT_SELF') error = 'CONNECTION_LIMIT_OTHER';
    else if (error === 'CONNECTION_LIMIT_OTHER') error = 'CONNECTION_LIMIT_SELF';
  }
  const hidden = pair.weak && pair.state !== 'connected';
  return {
    state: 'matched',
    pairId: pair.pairId,
    person: hidden ? null : { id: other.id, name: other.name, photoUrl: other.photoUrl },
    weak: pair.weak,
    code: pair.code,
    // On a weak pair even "you already know each other" says who it is, so it waits for the code too
    alreadyConnected: !hidden && pair.connectedBefore === true,
    iAccepted: pair.accepted.has(userId),
    otherAccepted: pair.accepted.has(otherId),
    pairState: pair.state,
    ...(error ? { error } : {}),
  };
}

export const shakeRouter = router({
  /** A phone was shaken: the server pairs it with a simultaneous shake nearby (poll status with the ticket). */
  register: protectedProcedure
    .input(
      z.object({
        geo: z
          .object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
            accuracy: z.number().min(0).max(100_000),
          })
          .optional(),
      }).optional(),
    )
    .mutation(({ ctx, input }): { ticket: string } => {
      if (!hit('shake:' + ctx.userId, 12, MINUTE)) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many shakes, try again in a minute' });
      }
      const ticket = registerShake({ userId: ctx.userId, ip: ctx.ip, geo: input?.geo });
      return { ticket };
    }),

  status: protectedProcedure
    .input(z.object({ ticket: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }): Promise<ShakeStatus> => {
      // The phone polls about once a second for up to ~40 s; more than that is not a phone
      if (!hit('shake-status:' + ctx.userId, 150, MINUTE)) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many shakes, try again in a minute' });
      }
      const owner = getTicketOwner(input.ticket);
      if (owner && owner !== ctx.userId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Shake not found' });
      const status = getShakeStatus(input.ticket);
      if (status.state !== 'matched') return { state: status.state };
      const matched = await describeMatch(ctx.db, ctx.userId, status.pair);
      return matched ?? { state: 'none' };
    }),

  respond: protectedProcedure
    .input(z.object({ pairId: z.string().min(1).max(100), accept: z.boolean() }))
    .mutation(async ({ ctx, input }): Promise<ShakeMatched> => {
      if (!hit('shake-respond:' + ctx.userId, 30, MINUTE)) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many shakes, try again in a minute' });
      }
      const pair = getPair(input.pairId);
      if (!pair || !pair.users.includes(ctx.userId)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shake not found' });
      }
      const otherId = pair.users[0] === ctx.userId ? pair.users[1] : pair.users[0];
      const outcome = recordResponse(pair, ctx.userId, input.accept);

      if (outcome === 'ready') {
        try {
          await ctx.db.$transaction(async (tx) => {
            await connectInPersonTx(tx, ctx.userId, otherId, 'shake');
          });
          finishPair(pair, { ok: true });
        } catch (err) {
          const message = err instanceof TRPCError || err instanceof Error ? err.message : 'Connection failed';
          finishPair(pair, { ok: false, error: message, userId: ctx.userId });
          throw err;
        }
        syncMilestonesForPair(ctx.db, ctx.userId, otherId).catch(() => {});
        scanMatchesForUser(ctx.db, ctx.userId).catch(() => {});
        scanMatchesForUser(ctx.db, otherId).catch(() => {});
      }

      const matched = await describeMatch(ctx.db, ctx.userId, pair);
      if (!matched) throw new TRPCError({ code: 'NOT_FOUND', message: 'Shake not found' });
      return matched;
    }),
});
