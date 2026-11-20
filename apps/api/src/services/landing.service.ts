import { isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { getDb } from '@so/db';
import { campaignFrom, LANDING_EVENTS } from '@so/shared';
import { z } from 'zod';
import { clientIp, hit, MINUTE } from './rate-limit.service.js';

const TEN_MINUTES = 10 * MINUTE;
const PEOPLE_FAILURE_TTL = 30_000;
const DAILY_COMBINATION_LIMIT = 500;
const OTHER = '(other)';
const DAY_MS = 24 * 60 * MINUTE;
const eventBody = z.object({
  action: z.enum(LANDING_EVENTS),
  campaign: z.unknown().optional(),
  referrerHost: z.string().max(253).optional(),
});

function referrerHostname(value = ''): string {
  const host = value.toLowerCase().replace(/\.$/, '');
  if (isIP(host) || !host.includes('.')) return '';
  return host.split('.').every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ? host : '';
}

export function registerLandingEndpoints(app: FastifyInstance) {
  app.post('/api/landing/event', { bodyLimit: 2048, logLevel: 'silent' }, async (req, reply) => {
    const event = eventBody.safeParse(req.body);
    if (!event.success) return reply.code(400).send();
    if (!hit('landing:' + clientIp(req.raw), 120, MINUTE)) return reply.code(429).send();
    const { action, referrerHost } = event.data;
    const { utm_source = '', utm_medium = '', utm_campaign = '' } = campaignFrom(event.data.campaign) ?? {};
    try {
      const db = getDb();
      const dayNumber = Math.floor(Date.now() / DAY_MS);
      const day = new Date(dayNumber * DAY_MS);
      const firstWrite = await db.$transaction(async (tx) => {
        // A lock per UTC day keeps the count and allocation atomic across API instances.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('landing_action_days'), ${dayNumber}::int)`;
        let key = {
          day, action, utmSource: utm_source, utmMedium: utm_medium,
          utmCampaign: utm_campaign, referrerHost: referrerHostname(referrerHost),
        };
        const existing = await tx.landingActionDay.findUnique({
          where: { day_action_utmSource_utmMedium_utmCampaign_referrerHost: key },
          select: { day: true },
        });
        const combinations = existing ? null : await tx.landingActionDay.count({
          where: { day, utmSource: { not: OTHER } },
        });
        if (combinations !== null && combinations >= DAILY_COMBINATION_LIMIT) {
          key = { day, action, utmSource: OTHER, utmMedium: OTHER, utmCampaign: OTHER, referrerHost: OTHER };
        }
        await tx.landingActionDay.upsert({
          where: { day_action_utmSource_utmMedium_utmCampaign_referrerHost: key },
          create: { ...key, count: 1 },
          update: { count: { increment: 1 } },
        });
        return combinations === 0;
      }, { isolationLevel: 'ReadCommitted' });
      if (firstWrite) {
        const utcDay = day.toISOString().slice(0, 10);
        await db.$executeRaw`
          DELETE FROM landing_action_days WHERE day < ${utcDay}::date - interval '13 months'
        `.catch(() => app.log.warn('Landing counter retention cleanup failed'));
      }
    } catch {
      app.log.warn('Landing counter write failed');
      return reply.code(503).send();
    }
    return reply.code(204).send();
  });

  let expiresAt = 0;
  let count: number | null = null;
  let pending: Promise<void> | undefined;
  app.get('/api/landing/people', async (_req, reply) => {
    if (Date.now() >= expiresAt) {
      // Count each non-deleted member with at least one non-deleted connection once.
      pending ??= Promise.resolve().then(() => getDb().user.count({
        where: {
          deletedAt: null,
          OR: [
            { connectionsFrom: { some: { userB: { deletedAt: null } } } },
            { connectionsTo: { some: { userA: { deletedAt: null } } } },
          ],
        },
      })).then((result) => {
        count = result;
        expiresAt = Date.now() + TEN_MINUTES;
      }).catch(() => {
        count = null;
        expiresAt = Date.now() + PEOPLE_FAILURE_TTL;
        app.log.warn('Landing people count unavailable');
      }).finally(() => { pending = undefined; });
      await pending;
    }
    if (count === null) return reply.code(503).send();
    reply.header('Cache-Control', 'public, max-age=' + Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    return count;
  });
}
