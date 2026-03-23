import { PrismaClient } from '../node_modules/.pnpm/@prisma+client@6.19.2_prism_6b2b1af085fe6797f5a5ea830937a8e3/node_modules/@prisma/client/index.js';

const db = new PrismaClient();
const users = await db.user.findMany({
  where: { photoUrl: { not: null } },
  select: { id: true, name: true, photoUrl: true },
  take: 5,
});
users.forEach(u => console.log(u.name, '|', (u.photoUrl || '').substring(0, 200)));
await db.$disconnect();
