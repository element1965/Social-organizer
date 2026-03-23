import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ datasourceUrl: 'postgresql://postgres:VWu9BYoj6MO1KcEsoHuIO8WI@ballast.proxy.rlwy.net:27469/social_organizer?schema=public' });

// Get all TG accounts with initData stored in accessToken
const accounts = await db.platformAccount.findMany({
  where: { platform: 'TELEGRAM' },
  select: { userId: true, accessToken: true, user: { select: { language: true } } },
});

console.log(`Total TG accounts: ${accounts.length}`);

let updated = 0;
for (const acc of accounts) {
  if (!acc.accessToken) continue;

  // Parse initData to extract language_code
  try {
    const params = new URLSearchParams(acc.accessToken);
    const userJson = params.get('user');
    if (!userJson) continue;
    const userData = JSON.parse(userJson);
    const langCode = userData.language_code?.slice(0, 2);
    if (!langCode) continue;

    // Only update if currently 'en' (default) and actual language is different
    if (acc.user.language === 'en' && langCode !== 'en') {
      await db.user.update({
        where: { id: acc.userId },
        data: { language: langCode },
      });
      updated++;
      console.log(`  Updated ${acc.userId}: en -> ${langCode}`);
    }
  } catch {
    // accessToken might not be initData format
    continue;
  }
}

console.log(`\nUpdated ${updated} users' language from initData`);

// Show distribution
const langCounts = await db.$queryRaw`SELECT language, COUNT(*) as cnt FROM users GROUP BY language ORDER BY cnt DESC`;
console.log('\nLanguage distribution:', langCounts);

await db.$disconnect();
