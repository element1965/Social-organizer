// Seed an ISOLATED local demo DB (so_video_demo) for the regular-collection video. Never production.
import { pathToFileURL } from 'node:url';
const url = process.env.DATABASE_URL || '';
if (!/localhost:5434\/so_video_demo/.test(url)) { console.error('refusing: DATABASE_URL must be local so_video_demo'); process.exit(1); }
const { getDb } = await import(pathToFileURL('D:/Automation/Development/projects/Social organizer/packages/db/dist/index.js').href);
const db = getDb();

await db.$executeRawUnsafe('TRUNCATE users CASCADE');

const first = ['Ольга', 'Игорь', 'Марта', 'Денис', 'Света', 'Павел', 'Нина', 'Артём', 'Вера', 'Лев', 'Юлия', 'Олег'];
const mk = (id, name, extra = {}) => db.user.create({ data: { id, name, language: 'ru', onboardingCompleted: true, skillsCompleted: true, preferredCurrency: 'USD', monthlyBudget: 50, remainingBudget: 50, lastSeen: new Date(), ...extra } });

await mk('u_author', 'Автор сбора', { monthlyBudget: 100, remainingBudget: 100 });
await mk('u_scanner', 'Анна (новый человек)', { monthlyBudget: 0, remainingBudget: 0 });
const conn = (a, b) => { const [x, y] = [a, b].sort(); return db.connection.create({ data: { userAId: x, userBId: y } }); };

let n = 0;
for (let i = 0; i < first.length; i++) {
  const id = `u_f${i}`;
  await mk(id, `${first[i]} ${String.fromCharCode(1040 + i)}.`);
  await conn('u_author', id);
  await db.inviteLink.create({ data: { inviterId: 'u_author', token: `demo-invite-${i}`, usedById: id, usedAt: new Date() } });
  for (let j = 0; j < 3; j++) {
    const sid = `u_s${i}_${j}`;
    await mk(sid, `Друг ${++n}`);
    await conn(id, sid);
  }
}
console.log('seeded users:', await db.user.count(), 'connections:', await db.connection.count());
await db.$disconnect();
