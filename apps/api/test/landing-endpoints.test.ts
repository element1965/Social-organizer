import { getDb, Prisma, type PrismaClient } from '@so/db';
import Fastify from 'fastify';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerLandingEndpoints } from '../src/services/landing.service.js';

vi.mock('@so/db', async (importOriginal) => ({
  ...await importOriginal<typeof import('@so/db')>(),
  getDb: vi.fn(),
}));
const missingTable = new Prisma.PrismaClientKnownRequestError(
  'Table landing_action_days does not exist', { code: 'P2021', clientVersion: '6' },
);
const lock = vi.fn();
const findUnique = vi.fn();
const count = vi.fn();
const upsert = vi.fn();
const prune = vi.fn();
const countPeople = vi.fn();
const transaction = vi.fn(async (work) => work({
  $executeRaw: lock,
  landingActionDay: { findUnique, count, upsert },
}));
let app: ReturnType<typeof Fastify>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T23:59:59Z'));
  vi.mocked(getDb).mockReturnValue({
    $transaction: transaction, $executeRaw: prune, user: { count: countPeople },
  } as unknown as PrismaClient);
  app = Fastify();
  registerLandingEndpoints(app);
});

afterEach(async () => {
  vi.useRealTimers();
  await app.close();
});

function event() {
  return app.inject({
    method: 'POST', url: '/api/landing/event',
    payload: { action: 'view', campaign: { utm_source: 'newsletter' }, referrerHost: 'Example.org' },
  });
}

it('folds new combinations at the cap and increments known combinations normally', async () => {
  count.mockResolvedValue(500);
  findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ day: new Date('2026-11-20') });

  expect((await event()).statusCode).toBe(204);
  expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({
    create: expect.objectContaining({
      action: 'view', utmSource: '(other)', utmMedium: '(other)', utmCampaign: '(other)', referrerHost: '(other)',
    }),
    update: { count: { increment: 1 } },
  }));
  expect((await event()).statusCode).toBe(204);
  expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({
    create: expect.objectContaining({ utmSource: 'newsletter', referrerHost: 'example.org' }),
  }));
  expect(lock).toHaveBeenCalledBefore(findUnique);
  expect(count).toHaveBeenCalledTimes(1);
  expect(prune).not.toHaveBeenCalled();
});

it('prunes on the first successful write of each UTC day and tolerates a pruning failure', async () => {
  findUnique.mockResolvedValue(null);
  count.mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
  prune.mockResolvedValue(1).mockRejectedValueOnce(missingTable);

  expect((await event()).statusCode).toBe(204);
  expect((await event()).statusCode).toBe(204);
  expect(prune).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date('2026-11-21T00:00:00Z'));
  expect((await event()).statusCode).toBe(204);
  expect(prune).toHaveBeenCalledTimes(2);
  const [sql, utcDay] = prune.mock.calls[1]!;
  expect(sql.join('')).toContain("interval '13 months'");
  expect(utcDay).toBe('2026-11-21');
});

it('returns 503 if the counter table is missing', async () => {
  findUnique.mockRejectedValue(missingTable);
  expect((await event()).statusCode).toBe(503);
  expect(prune).not.toHaveBeenCalled();
});

it('caches failed people counts for 30 seconds and retries after expiry', async () => {
  countPeople.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(42);
  const people = () => app.inject('/api/landing/people');

  const first = await Promise.all([people(), people()]);
  expect(first.map((response) => response.statusCode)).toEqual([503, 503]);
  vi.setSystemTime(Date.now() + 29_999);
  expect((await people()).statusCode).toBe(503);
  expect(countPeople).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + 1);
  const recovered = await people();
  expect(recovered.json()).toBe(42);
  expect(recovered.headers['cache-control']).toBe('public, max-age=600');
  expect(countPeople).toHaveBeenCalledTimes(2);
});
