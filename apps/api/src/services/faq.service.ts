import type { PrismaClient } from '@so/db';

export async function readFaq(db: PrismaClient, language: string, take?: number) {
  const read = (lang: string) => db.faqItem.findMany({
    where: { language: lang },
    orderBy: { viewCount: 'desc' },
    take,
  });
  const items = await read(language);
  return items.length === 0 && language !== 'en' ? read('en') : items;
}
