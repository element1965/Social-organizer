import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ datasourceUrl: 'postgresql://postgres:VWu9BYoj6MO1KcEsoHuIO8WI@ballast.proxy.rlwy.net:27469/social_organizer?schema=public' });

try {
  const now = new Date();
  console.log('Now:', now.toISOString());

  // Step 1: Load messages
  const messages = await db.autoChainMessage.findMany({
    where: { isActive: true },
    orderBy: [{ dayOffset: 'asc' }, { sortOrder: 'asc' }],
  });
  console.log('Active messages:', messages.length);
  if (messages.length === 0) { console.log('NO MESSAGES - EXIT'); process.exit(0); }

  // Step 2: Load TG accounts
  const tgAccounts = await db.platformAccount.findMany({
    where: { platform: 'TELEGRAM' },
    select: {
      platformId: true,
      userId: true,
      user: { select: { language: true, createdAt: true } },
    },
  });
  console.log('TG accounts:', tgAccounts.length);
  if (tgAccounts.length === 0) { console.log('NO TG ACCOUNTS - EXIT'); process.exit(0); }

  // Step 3: Invited users
  const invitedLinks = await db.inviteLink.findMany({
    where: { usedById: { not: null } },
    select: { usedById: true },
  });
  const invitedUserIds = new Set(invitedLinks.map(l => l.usedById));
  console.log('Invited user IDs:', invitedUserIds.size);

  // Step 4: Existing deliveries
  const existingDeliveries = await db.autoChainDelivery.findMany({
    select: { messageId: true, userId: true },
  });
  const deliveredSet = new Set(existingDeliveries.map(d => `${d.messageId}:${d.userId}`));
  console.log('Existing deliveries:', deliveredSet.size);

  // Step 5: Today's deliveries
  const nowKyivStr = now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' });
  const todayKyiv = new Date(nowKyivStr);
  todayKyiv.setHours(0, 0, 0, 0);
  const todayUtcOffset = now.getTime() - new Date(nowKyivStr).getTime();
  const todayStartUtc = new Date(todayKyiv.getTime() + todayUtcOffset);
  console.log('todayStartUtc:', todayStartUtc.toISOString());

  const todayDeliveries = await db.autoChainDelivery.findMany({
    where: { sentAt: { gte: todayStartUtc }, success: true },
    select: { userId: true },
  });
  const sentTodaySet = new Set(todayDeliveries.map(d => d.userId));
  console.log('Sent today:', sentTodaySet.size);

  function toKyivDate(date) {
    const kyivStr = date.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' });
    return new Date(kyivStr);
  }

  function startOfDayKyiv(date) {
    const kyiv = toKyivDate(date);
    kyiv.setHours(0, 0, 0, 0);
    return kyiv;
  }

  // Simulate processing first 3 users
  let processed = 0;
  for (const acc of tgAccounts) {
    if (processed >= 3) break;
    const userCreatedAt = acc.user?.createdAt;
    if (!userCreatedAt) { console.log('  SKIP - no createdAt for', acc.userId); continue; }

    const userDayStart = startOfDayKyiv(userCreatedAt);
    const isInvited = invitedUserIds.has(acc.userId);

    if (sentTodaySet.has(acc.userId)) { console.log('  SKIP - already sent today:', acc.userId); continue; }

    console.log(`\nUser: ${acc.userId} (invited: ${isInvited})`);
    console.log('  createdAt:', userCreatedAt.toISOString());
    console.log('  userDayStart:', userDayStart.toISOString());

    let matched = 0;
    for (const msg of messages) {
      if (matched >= 3) break;
      const key = `${msg.id}:${acc.userId}`;
      if (deliveredSet.has(key)) continue;

      // Variant filter
      if (msg.variant === 'invited' && !isInvited) continue;
      if (msg.variant === 'organic' && isInvited) continue;

      const sendTime = new Date(userDayStart.getTime());
      sendTime.setDate(sendTime.getDate() + msg.dayOffset);
      sendTime.setHours(7, 0, 0, 0);
      sendTime.setMinutes(sendTime.getMinutes() + msg.sortOrder * msg.intervalMin);

      if (sendTime > now) {
        console.log(`  day=${msg.dayOffset} sort=${msg.sortOrder} variant=${msg.variant} sendTime=${sendTime.toISOString()} > now → SKIP (future)`);
        matched++;
        continue;
      }

      console.log(`  day=${msg.dayOffset} sort=${msg.sortOrder} variant=${msg.variant} sendTime=${sendTime.toISOString()} → WOULD SEND`);
      matched++;
      break; // Only first match (1 per day)
    }
    processed++;
  }
} catch (err) {
  console.error('ERROR:', err);
} finally {
  await db.$disconnect();
}
