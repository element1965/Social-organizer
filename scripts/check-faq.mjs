import { PrismaClient } from '../node_modules/.pnpm/@prisma+client@6.19.2_prism_6b2b1af085fe6797f5a5ea830937a8e3/node_modules/@prisma/client/index.js';

const db = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:VWu9BYoj6MO1KcEsoHuIO8WI@ballast.proxy.rlwy.net:27469/social_organizer?schema=public' } }
});

const items = await db.faqItem.findMany({
  orderBy: { language: 'asc' },
  select: { id: true, language: true, question: true, groupId: true, isLocalized: true }
});

const byLang = {};
items.forEach(i => { byLang[i.language] = (byLang[i.language] || 0) + 1; });
console.log('Total items:', items.length);
console.log('By language:', JSON.stringify(byLang, null, 2));
console.log('---');

const originals = items.filter(i => i.isLocalized === false);
console.log('Originals (not auto-translated):');
originals.forEach(i => console.log(i.id, '|', i.language, '|', i.groupId ? 'has-group' : 'no-group', '|', i.question.slice(0, 80)));

await db.$disconnect();
