import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const db = new PrismaClient();
const en = JSON.parse(fs.readFileSync('packages/i18n/locales/en.json', 'utf8'));
const existing = new Set(Object.keys(en.skills || {}));

const cats = await db.skillCategory.findMany({
  select: { key: true },
  where: { key: { not: { startsWith: 'other' } } },
});

const missing = cats.filter(c => !existing.has(c.key)).map(c => c.key);
console.log('Missing from locales:', JSON.stringify(missing));
console.log('Count:', missing.length);
await db.$disconnect();
