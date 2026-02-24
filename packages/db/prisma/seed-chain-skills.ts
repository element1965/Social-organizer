import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Auto-chain messages to remind users to fill in skills/needs.
 * These are sent only to users who have NOT filled their skills yet (variant: 'all').
 * The auto-chain worker checks dayOffset from registration date.
 *
 * Schedule:
 *   Day 1 = covered by existing onboarding chain messages
 *   Day 3 = first skills reminder
 *   Day 7 = second reminder with explanation of why
 *   Day 14 = third reminder with social proof
 *   Day 30 = final nudge
 *
 * These use high sortOrder (100+) to not conflict with existing chain messages.
 */
const CHAIN_MESSAGES = [
  {
    text: '🛠 You haven\'t filled in your skills and needs yet!\n\nIt only takes 2 minutes — just go through the list and mark what you can do and what you need. This helps your network find the right people to help.\n\nOpen Settings → Skills & Needs',
    dayOffset: 3,
    sortOrder: 100,
    intervalMin: 120,
    variant: 'all',
    buttonUrl: 'https://www.orginizer.com/settings',
    buttonText: 'Fill in skills',
  },
  {
    text: '💡 Did you know? When you mark your skills, your friends can see who in their network can help with specific tasks.\n\nFor example: if you know how to fix plumbing, your friend\'s friend might need exactly that — and clearing (mutual help exchange) becomes possible!\n\nIt takes just a minute to set up.',
    dayOffset: 7,
    sortOrder: 100,
    intervalMin: 120,
    variant: 'all',
    buttonUrl: 'https://www.orginizer.com/settings',
    buttonText: 'Set up skills',
  },
  {
    text: '📊 Most active users in Social Organizer have filled in their skills and needs.\n\nThis helps the network work better: people find help faster, and mutual exchanges (clearing) reduce costs for everyone.\n\nYour skills matter — even everyday ones like cooking, driving, or language knowledge!',
    dayOffset: 14,
    sortOrder: 100,
    intervalMin: 120,
    variant: 'all',
    buttonUrl: 'https://www.orginizer.com/settings',
    buttonText: 'Add my skills',
  },
  {
    text: '🤝 Last reminder: your skills profile is still empty.\n\nWithout it, your friends won\'t know what you can help with, and the system can\'t suggest mutual help exchanges.\n\nGo to Settings → Skills & Needs — it takes less than a minute!',
    dayOffset: 30,
    sortOrder: 100,
    intervalMin: 120,
    variant: 'all',
    buttonUrl: 'https://www.orginizer.com/settings',
    buttonText: 'Fill in now',
  },
];

async function main() {
  for (const msg of CHAIN_MESSAGES) {
    // Check if we already have a chain message with this dayOffset+sortOrder
    const existing = await prisma.autoChainMessage.findFirst({
      where: { dayOffset: msg.dayOffset, sortOrder: msg.sortOrder },
    });
    if (existing) {
      console.log(`Skipping dayOffset=${msg.dayOffset}, sortOrder=${msg.sortOrder} (already exists)`);
      continue;
    }
    await prisma.autoChainMessage.create({ data: msg });
    console.log(`Created chain message: day ${msg.dayOffset}`);
  }
  console.log('Done seeding skills reminder chain messages');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
