import { Prisma, type PrismaClient } from '@so/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteUserAccount } from '../src/services/account-deletion.service.js';
import { resolveExternalIdentity } from '../src/services/identity.service.js';
import { createUserWithReferralSlug } from '../src/services/referral-slug.service.js';

vi.mock('../src/services/notification.service.js');
vi.mock('../src/services/graph-cache.service.js');

const missingCampaignTable = () => new Prisma.PrismaClientKnownRequestError(
  'Table user_signup_campaigns does not exist', { code: 'P2021', clientVersion: '6' },
);
const campaign = { utm_source: 'newsletter' };
const user = { id: 'user-1' };

function signupDb() {
  const create = vi.fn(async ({ data }: { data: Prisma.UserCreateInput }) => {
    if (data.signupCampaign) throw missingCampaignTable();
    return user;
  });
  const writeCampaign = vi.fn().mockRejectedValue(missingCampaignTable());
  const db = {
    platformAccount: { findUnique: vi.fn().mockResolvedValue(null) },
    user: { create },
    $transaction: vi.fn(async (work) => work({
      $queryRaw: vi.fn().mockResolvedValue([user]),
      userSignupCampaign: { create: writeCampaign },
    })),
  };
  return { db: db as unknown as PrismaClient, create, writeCampaign };
}

afterEach(() => vi.restoreAllMocks());

describe('account operations without the campaign migration', () => {
  it('creates the user and logs a failed standalone campaign write', async () => {
    const report = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db, create, writeCampaign } = signupDb();
    await expect(createUserWithReferralSlug(db, { name: 'Test' }, campaign)).resolves.toEqual(user);
    expect(create.mock.calls[0]?.[0].data).not.toHaveProperty('signupCampaign');
    expect(writeCampaign).toHaveBeenCalledWith({ data: { userId: user.id, campaign } });
    expect(report).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ code: 'P2021' }));
  });

  it.each(['APPLE', 'GOOGLE'] as const)('returns a new %s account even if attribution fails', async (platform) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = signupDb();
    await expect(resolveExternalIdentity(db, {
      platform, platformId: 'provider-id', name: 'Test', verifiedEmail: null, campaign,
    })).resolves.toEqual({ userId: user.id, isNew: true });
  });

  it('commits a soft deletion before attempting the campaign cleanup', async () => {
    const report = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const update = vi.fn();
    const inTransaction = vi.fn().mockRejectedValue(missingCampaignTable());
    const commit = vi.fn();
    const deleteCampaign = vi.fn().mockRejectedValue(missingCampaignTable());
    const empty = { deleteMany: vi.fn() };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      connection: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([]), ...empty },
      inviteLink: { count: vi.fn().mockResolvedValue(0) },
      pendingConnection: empty,
      obligation: empty,
      collection: { updateMany: vi.fn() },
      user: { update },
      userSignupCampaign: { deleteMany: inTransaction },
      userContact: empty,
      userSkill: empty,
      userNeed: empty,
    };
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue({ deletedAt: null }) },
      inviteLink: { findFirst: vi.fn().mockResolvedValue(null) },
      userSignupCampaign: { deleteMany: deleteCampaign },
      $transaction: vi.fn(async (work) => {
        const result = await work(tx);
        commit();
        return result;
      }),
    } as unknown as PrismaClient;

    await expect(deleteUserAccount(db, user.id)).resolves.toEqual({ mode: 'soft' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }));
    expect(inTransaction).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledBefore(deleteCampaign);
    expect(deleteCampaign).toHaveBeenCalledWith({ where: { userId: user.id } });
    expect(report).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ code: 'P2021' }));
  });
});
