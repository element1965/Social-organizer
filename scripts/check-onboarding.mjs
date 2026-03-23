import { PrismaClient } from '../node_modules/.pnpm/@prisma+client@6.19.2_prism_6b2b1af085fe6797f5a5ea830937a8e3/node_modules/@prisma/client/default.js';

const db = new PrismaClient({ datasourceUrl: 'postgresql://postgres:1111@localhost:5434/social_organizer' });

const notOnb = await db.user.count({ where: { onboardingCompleted: false, deletedAt: null } });
const total = await db.user.count({ where: { deletedAt: null } });
const onb = await db.user.count({ where: { onboardingCompleted: true, deletedAt: null } });
console.log(`Total: ${total}, Onboarded: ${onb}, NOT onboarded: ${notOnb}, Rate: ${((onb / total) * 100).toFixed(1)}%`);

const recent = await db.user.findMany({
  where: { onboardingCompleted: false, deletedAt: null },
  select: { id: true, name: true, language: true, createdAt: true, monthlyBudget: true },
  orderBy: { createdAt: 'desc' },
  take: 15
});
console.log('\nRecent non-onboarded users:');
recent.forEach(u => console.log(
  u.createdAt.toISOString().slice(0, 16), u.language, JSON.stringify(u.name), 'budget:', u.monthlyBudget
));

// Check how many have contacts
const withContacts = await db.userContact.groupBy({
  by: ['userId'],
  where: { userId: { in: recent.map(r => r.id) } },
  _count: true
});
console.log('\nContacts info for non-onboarded:');
const contactMap = new Map(withContacts.map(c => [c.userId, c._count]));
recent.forEach(u => console.log(
  u.name, '→ contacts:', contactMap.get(u.id) || 0, 'budget:', u.monthlyBudget
));

// Check auto-chain messages
const chains = await db.autoChainMessage.findMany({ orderBy: { dayOffset: 'asc' } });
console.log(`\nAuto-chain messages: ${chains.length}`);
chains.forEach(c => console.log(`  day ${c.dayOffset}:`, c.text?.slice(0, 80)));

// Check pending connections for non-onboarded users
const pending = await db.pendingConnection.findMany({
  where: { fromUserId: { in: recent.map(r => r.id) } },
  select: { fromUserId: true, status: true }
});
console.log('\nPending connections for non-onboarded:');
const pendingMap = new Map();
pending.forEach(p => {
  const key = p.fromUserId;
  if (!pendingMap.has(key)) pendingMap.set(key, []);
  pendingMap.get(key).push(p.status);
});
recent.forEach(u => {
  const statuses = pendingMap.get(u.id) || [];
  console.log(u.name, '→', statuses.length ? statuses.join(', ') : 'no pending');
});

await db.$disconnect();
