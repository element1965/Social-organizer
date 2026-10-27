import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

// Check when auto-chain messages were created
const firstMsg = await db.autoChainMessage.findFirst({
  orderBy: { id: 'asc' },
  select: { id: true, dayOffset: true, variant: true },
});
console.log('First message:', firstMsg);

// Check if there's a createdAt field
const allMsgs = await db.$queryRaw`SELECT id, "dayOffset", variant, "createdAt" FROM "auto_chain_messages" ORDER BY "createdAt" ASC LIMIT 3`;
console.log('First 3 by createdAt:', allMsgs);

const lastMsgs = await db.$queryRaw`SELECT id, "dayOffset", variant, "createdAt" FROM "auto_chain_messages" ORDER BY "createdAt" DESC LIMIT 3`;
console.log('Last 3 by createdAt:', lastMsgs);

// Check total count
const count = await db.autoChainMessage.count();
console.log('Total auto_chain_messages:', count);

// Check delivery table schema
const deliveryCount = await db.autoChainDelivery.count();
console.log('Total deliveries:', deliveryCount);

// Check if BullMQ is running by looking at any recent activity
const recentNotifs = await db.notification.findMany({
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: { createdAt: true, type: true },
});
console.log('Most recent notification:', recentNotifs[0]);

await db.$disconnect();
