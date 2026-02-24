import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  // Home & Household
  { key: 'plumbing', group: 'home', sortOrder: 1 },
  { key: 'electrical', group: 'home', sortOrder: 2 },
  { key: 'carpentry', group: 'home', sortOrder: 3 },
  { key: 'painting', group: 'home', sortOrder: 4 },
  { key: 'cleaning', group: 'home', sortOrder: 5 },
  { key: 'gardening', group: 'home', sortOrder: 6 },
  { key: 'cooking', group: 'home', sortOrder: 7 },
  { key: 'childcare', group: 'home', sortOrder: 8 },

  // Professional
  { key: 'accounting', group: 'professional', sortOrder: 1 },
  { key: 'legal', group: 'professional', sortOrder: 2 },
  { key: 'marketing', group: 'professional', sortOrder: 3 },
  { key: 'design', group: 'professional', sortOrder: 4 },
  { key: 'photography', group: 'professional', sortOrder: 5 },
  { key: 'writing', group: 'professional', sortOrder: 6 },
  { key: 'translation', group: 'professional', sortOrder: 7 },

  // Health & Wellness
  { key: 'firstAid', group: 'health', sortOrder: 1 },
  { key: 'nursing', group: 'health', sortOrder: 2 },
  { key: 'psychology', group: 'health', sortOrder: 3 },
  { key: 'nutrition', group: 'health', sortOrder: 4 },
  { key: 'fitness', group: 'health', sortOrder: 5 },
  { key: 'massage', group: 'health', sortOrder: 6 },

  // Transport & Moving
  { key: 'driving', group: 'transport', sortOrder: 1 },
  { key: 'moving', group: 'transport', sortOrder: 2 },
  { key: 'delivery', group: 'transport', sortOrder: 3 },

  // Digital & Tech
  { key: 'webDev', group: 'digital', sortOrder: 1 },
  { key: 'mobileDev', group: 'digital', sortOrder: 2 },
  { key: 'sysAdmin', group: 'digital', sortOrder: 3 },
  { key: 'dataRecovery', group: 'digital', sortOrder: 4 },
  { key: 'socialMedia', group: 'digital', sortOrder: 5 },
  { key: 'videoEditing', group: 'digital', sortOrder: 6 },

  // Social & Education
  { key: 'eventOrganizing', group: 'social', sortOrder: 1 },
  { key: 'tutoring', group: 'social', sortOrder: 2 },
  { key: 'mentoring', group: 'social', sortOrder: 3 },
  { key: 'publicSpeaking', group: 'social', sortOrder: 4 },
  { key: 'fundraising', group: 'social', sortOrder: 5 },
];

async function main() {
  for (const cat of CATEGORIES) {
    await prisma.skillCategory.upsert({
      where: { key: cat.key },
      create: cat,
      update: { group: cat.group, sortOrder: cat.sortOrder },
    });
  }
  console.log(`Seeded ${CATEGORIES.length} skill categories`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
