import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// Check botStart for these chatIds
const chatIds = ['454698286', '1322118880', '457465732'];
for (const chatId of chatIds) {
  const bs = await db.botStart.findUnique({ where: { chatId } });
  if (bs) console.log(`BotStart for ${chatId}:`, JSON.stringify(bs));
}

// Also search botStart by username directly
const bsByUsername = await db.botStart.findMany({ where: { username: 'ana_stasiia_y' } });
console.log('BotStart by username:', JSON.stringify(bsByUsername));

// Search all botStarts containing 'ana' in username
const allBs = await db.botStart.findMany({ where: { username: { not: null } } });
for (const bs of allBs) {
  if (bs.username && bs.username.toLowerCase().includes('ana')) {
    console.log('BotStart match:', JSON.stringify(bs));
  }
}

// The first Anastasiya (cmljufnau0002pf01bnfikmef) was already soft-deleted.
// Let's check which TG platformId matches ana_stasiia_y among deleted users
const deleted = await db.user.findMany({
  where: { deletedAt: { not: null }, name: { contains: 'Анаст', mode: 'insensitive' } },
  select: { id: true, name: true, deletedAt: true }
});
console.log('Deleted Anastasia users:', JSON.stringify(deleted));

await db.$disconnect();
