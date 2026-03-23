import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ datasourceUrl: 'postgresql://postgres:VWu9BYoj6MO1KcEsoHuIO8WI@ballast.proxy.rlwy.net:27469/social_organizer?schema=public' });

const invites = await db.inviteLink.findMany({
  where: { usedById: { not: null } },
  select: { usedById: true },
});
console.log('Invite links used:', invites.length);
const invitedIds = new Set(invites.map(i => i.usedById));

const tgAccounts = await db.platformAccount.findMany({
  where: { platform: 'TELEGRAM' },
  select: { userId: true, user: { select: { name: true, createdAt: true } } },
});
console.log('TG accounts:', tgAccounts.length);

let invitedCount = 0;
let organicCount = 0;
for (const a of tgAccounts) {
  if (invitedIds.has(a.userId)) invitedCount++;
  else organicCount++;
}
console.log('Invited:', invitedCount);
console.log('Organic:', organicCount);

const msgs = await db.autoChainMessage.findMany({
  where: { isActive: true },
  select: { variant: true },
});
const v = {};
for (const m of msgs) {
  v[m.variant] = (v[m.variant] || 0) + 1;
}
console.log('Message variants:', JSON.stringify(v));

// Simulate timing for oldest user
const oldest = tgAccounts.sort((a, b) => new Date(a.user.createdAt) - new Date(b.user.createdAt))[0];
if (oldest) {
  console.log('\nOldest user:', oldest.user.name, 'created:', oldest.user.createdAt);
  console.log('Is invited:', invitedIds.has(oldest.userId));

  const now = new Date();
  // Simulate toKyivDate
  const kyivStr = oldest.user.createdAt.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' });
  const kyivDate = new Date(kyivStr);
  kyivDate.setHours(0, 0, 0, 0);
  console.log('startOfDayKyiv:', kyivDate.toISOString());

  const sendTime = new Date(kyivDate.getTime());
  sendTime.setDate(sendTime.getDate() + 0);
  sendTime.setHours(7, 0, 0, 0);
  console.log('sendTime (dayOffset=0):', sendTime.toISOString());
  console.log('now:', now.toISOString());
  console.log('sendTime > now:', sendTime > now);
}

await db.$disconnect();
