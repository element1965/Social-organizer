const { PrismaClient } = require('../node_modules/.pnpm/@prisma+client@6.19.2_prism_6b2b1af085fe6797f5a5ea830937a8e3/node_modules/@prisma/client');

const db = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

(async () => {
  const before = await db.autoChainMessage.count({ where: { isActive: true } });
  const result = await db.autoChainMessage.updateMany({ data: { isActive: false } });
  const after = await db.autoChainMessage.count({ where: { isActive: true } });
  console.log('Was active:', before, '| Updated:', result.count, '| Now active:', after);
  await db.$disconnect();
})();
