// Run from apps/api: pnpm exec tsx --env-file=.env scripts/check-invite-slug.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getDb } from '@so/db';

const database = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)) {
  throw new Error('This check requires a local database.');
}
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.REDIS_URL;

const { authRouter } = await import('../src/routers/auth.router.js');
const { userRouter } = await import('../src/routers/user.router.js');
const { findInvitePreview } = await import('../src/services/invite-preview.service.js');
const db = getDb();
const testId = randomUUID();
const email = `invite-check-${testId}@test.local`;
const legacyName = `Legacy invite check ${testId}`;
const readable = /^[a-hjkmnp-z2-9]{8}$/;
const context = { db, ip: '127.0.0.1' };
let legacyId: string | undefined;

try {
  const { userId } = await authRouter.createCaller({ ...context, userId: null })
    .registerWithEmail({ email, password: randomUUID(), name: 'New invite check' });
  const created = await db.user.findUniqueOrThrow({ where: { id: userId } });
  assert.match(created.referralSlug ?? '', readable, 'registration assigns a readable slug');

  const legacy = await db.user.create({ data: { name: legacyName } });
  legacyId = legacy.id;
  assert.equal(legacy.referralSlug, null);
  const caller = userRouter.createCaller({ ...context, userId: legacy.id });
  const [first, second] = await Promise.all([caller.inviteSlug(), caller.inviteSlug()]);
  assert.match(first.referralSlug, readable);
  assert.equal(first.referralSlug, second.referralSlug, 'concurrent requests return the same slug');
  const stored = await db.user.findUniqueOrThrow({ where: { id: legacy.id } });
  assert.equal(stored.referralSlug, first.referralSlug);
  // This resolver serves the HTML for /i/:slug and still treats a CUID as a user id.
  assert.equal((await findInvitePreview(db, legacy.id))?.name, legacyName);
  assert.equal((await findInvitePreview(db, first.referralSlug))?.name, legacyName);
  await assert.rejects(caller.updateReferralSlug({ slug: created.referralSlug! }), { code: 'CONFLICT' });
  const custom = `edit-${testId.slice(0, 8)}`;
  await caller.updateReferralSlug({ slug: custom });
  assert.equal((await caller.inviteSlug()).referralSlug, custom);
  assert.equal((await findInvitePreview(db, legacy.id))?.name, legacyName);
  console.log('Registration, concurrent lazy assignment, both invite token forms, and manual edits passed.');
} finally {
  try {
    await db.user.deleteMany({ where: { OR: [{ email }, ...(legacyId ? [{ id: legacyId }] : [])] } });
  } finally {
    await db.$disconnect();
  }
}
