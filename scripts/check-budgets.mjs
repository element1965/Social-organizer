import { PrismaClient } from '../node_modules/.pnpm/@prisma+client@6.19.2_prism_6b2b1af085fe6797f5a5ea830937a8e3/node_modules/@prisma/client/index.js';

const db = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:VWu9BYoj6MO1KcEsoHuIO8WI@ballast.proxy.rlwy.net:27469/social_organizer?schema=public' } },
});

const todayStart = new Date();
todayStart.setUTCHours(0, 0, 0, 0);

const users = await db.user.findMany({
  where: { createdAt: { gte: todayStart } },
  select: { id: true, name: true, monthlyBudget: true, remainingBudget: true, onboardingCompleted: true, createdAt: true },
  orderBy: { createdAt: 'asc' },
});

console.log(`Today new users: ${users.length}\n`);
let withBudget = 0;
let withoutBudget = 0;
let totalBudget = 0;

for (const u of users) {
  const b = u.monthlyBudget ? Number(u.monthlyBudget) : 0;
  totalBudget += b;
  if (b > 0) withBudget++; else withoutBudget++;
  console.log(
    u.name.padEnd(28),
    `budget: $${String(b).padStart(5)}`,
    `onboarding: ${u.onboardingCompleted}`,
  );
}

console.log(`\n--- SUMMARY ---`);
console.log(`With budget:    ${withBudget}`);
console.log(`Without budget: ${withoutBudget}`);
console.log(`Total USD:      $${totalBudget}`);
console.log(`Avg per user:   $${users.length > 0 ? (totalBudget / users.length).toFixed(1) : 0}`);

// Also check contacts for those without budget
const noBudgetIds = users.filter(u => !u.monthlyBudget || Number(u.monthlyBudget) === 0).map(u => u.id);
if (noBudgetIds.length > 0) {
  const contacts = await db.userContact.findMany({
    where: { userId: { in: noBudgetIds } },
    select: { userId: true, type: true, value: true },
  });
  const contactsByUser = {};
  for (const c of contacts) {
    if (!contactsByUser[c.userId]) contactsByUser[c.userId] = [];
    contactsByUser[c.userId].push(`${c.type}: ${c.value}`);
  }
  console.log(`\n--- Users WITHOUT budget ---`);
  for (const u of users.filter(u => !u.monthlyBudget || Number(u.monthlyBudget) === 0)) {
    const c = contactsByUser[u.id] || [];
    console.log(`  ${u.name} — onboarding: ${u.onboardingCompleted}, contacts: ${c.length > 0 ? c.join(', ') : 'none'}`);
  }
}

await db.$disconnect();
