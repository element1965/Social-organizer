const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const db = new PrismaClient();
(async () => {
  const en = JSON.parse(fs.readFileSync('../i18n/locales/en.json', 'utf8'));
  const existing = new Set(Object.keys(en.skills || {}));
  const cats = await db.skillCategory.findMany({
    select: { key: true },
    where: { key: { not: { startsWith: 'other' } } },
  });
  const missing = cats.filter(c => !existing.has(c.key)).map(c => c.key);
  console.log(JSON.stringify(missing));
  await db.$disconnect();
})();
