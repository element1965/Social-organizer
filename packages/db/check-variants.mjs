import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ datasourceUrl: 'postgresql://postgres:VWu9BYoj6MO1KcEsoHuIO8WI@ballast.proxy.rlwy.net:27469/social_organizer?schema=public' });

// Count users with TG accounts
const tgAccounts = await db.platformAccount.findMany({
  where: { platform: 'TELEGRAM' },
  select: { userId: true },
});
console.log('Total TG users:', tgAccounts.length);

// Count invited users (usedById in invite links)
const invitedLinks = await db.inviteLink.findMany({
  where: { usedById: { not: null } },
  select: { usedById: true },
});
const invitedUserIds = new Set(invitedLinks.map((l) => l.usedById));
console.log('Invited user IDs (usedById):', invitedUserIds.size);

// Count TG users that are invited vs organic
const tgUserIds = new Set(tgAccounts.map((a) => a.userId));
let invitedWithTg = 0;
let organicWithTg = 0;
for (const uid of tgUserIds) {
  if (invitedUserIds.has(uid)) invitedWithTg++;
  else organicWithTg++;
}
console.log('TG users who are INVITED (usedById exists):', invitedWithTg);
console.log('TG users who are ORGANIC (no usedById):', organicWithTg);

// Check deliveries by variant
const deliveries = await db.autoChainDelivery.findMany({
  where: { success: true },
  select: { messageId: true },
});
const msgIds = [...new Set(deliveries.map((d) => d.messageId))];
const messages = await db.autoChainMessage.findMany({
  where: { id: { in: msgIds } },
  select: { id: true, variant: true, dayOffset: true, sortOrder: true },
});
const msgMap = new Map(messages.map((m) => [m.id, m]));

const variantCounts = {};
for (const d of deliveries) {
  const msg = msgMap.get(d.messageId);
  const v = msg?.variant || 'unknown';
  variantCounts[v] = (variantCounts[v] || 0) + 1;
}
console.log('Deliveries by message variant:', variantCounts);

// Show all auto chain messages
const allMsgs = await db.autoChainMessage.findMany({
  where: { isActive: true },
  select: { id: true, dayOffset: true, sortOrder: true, variant: true, sentCount: true, text: true },
  orderBy: [{ dayOffset: 'asc' }, { sortOrder: 'asc' }],
});
console.log('\nActive messages:');
for (const m of allMsgs) {
  console.log(`  day=${m.dayOffset} order=${m.sortOrder} variant=${m.variant} sent=${m.sentCount} text="${m.text.substring(0, 50)}..."`);
}

await db.$disconnect();
