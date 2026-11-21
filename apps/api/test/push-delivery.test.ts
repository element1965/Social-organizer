import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@so/db';

vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.VAPID_PRIVATE_KEY = 'test-private-key';
});

const sent = vi.hoisted(() => [] as string[]);
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }) => {
      sent.push(sub.endpoint);
    }),
  },
}));

const { sendWebPush } = await import('../src/services/web-push.service.js');
const { MAX_PUSH_SUBSCRIPTIONS } = await import('../src/services/push-endpoint.js');

describe('Web Push delivery', () => {
  it('sends to at most the newest ten browsers of each account', async () => {
    // Newest first, as the query asks the database for
    const rows = [
      ...Array.from({ length: 14 }, (_, i) => ({ id: `a${i}`, userId: 'a', endpoint: `https://fcm.googleapis.com/fcm/send/a${i}`, p256dh: 'k', auth: 'x' })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, userId: 'b', endpoint: `https://fcm.googleapis.com/fcm/send/b${i}`, p256dh: 'k', auth: 'x' })),
    ];
    const findMany = vi.fn(async () => rows);
    const db = { pushSubscription: { findMany, deleteMany: vi.fn() } } as unknown as PrismaClient;

    await sendWebPush(db, ['a', 'b'], { title: 't', body: 'b' });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
    expect(sent.filter((e) => e.includes('/a'))).toEqual(rows.slice(0, MAX_PUSH_SUBSCRIPTIONS).map((r) => r.endpoint));
    expect(sent.filter((e) => e.includes('/b'))).toHaveLength(3);
  });
});
