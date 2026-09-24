// Seed an ISOLATED local demo DB (so_video_demo) for the regular-collection video. Never production.
// SEED_LANG=<locale> (default ru) sets users' language and the demo names from captions.mjs.
import { pathToFileURL } from 'node:url';
import { CAPTIONS } from './captions.mjs';
const url = process.env.DATABASE_URL || '';
if (!/localhost:5434\/so_video_demo/.test(url)) { console.error('refusing: DATABASE_URL must be local so_video_demo'); process.exit(1); }
const lang = process.env.SEED_LANG || 'ru';
const cap = CAPTIONS[lang];
if (!cap) { console.error(`unknown SEED_LANG ${lang}`); process.exit(1); }
const { getDb } = await import(pathToFileURL('D:/Automation/Development/projects/Social organizer/packages/db/dist/index.js').href);
const db = getDb();

await db.$executeRawUnsafe('TRUNCATE users CASCADE');

const cyrillic = ['ru', 'uk', 'be', 'sr'].includes(lang);
const first = cyrillic
  ? ['Ольга', 'Игорь', 'Марта', 'Денис', 'Света', 'Павел', 'Нина', 'Артём', 'Вера', 'Лев', 'Юлия', 'Олег']
  : ['Olga', 'Igor', 'Marta', 'Denis', 'Sara', 'Paul', 'Nina', 'Adam', 'Vera', 'Leo', 'Julia', 'Omar'];
const initial = (i) => String.fromCharCode((cyrillic ? 1040 : 65) + i);
const mk = (id, name, extra = {}) => db.user.create({ data: { id, name, language: lang, onboardingCompleted: true, skillsCompleted: true, preferredCurrency: 'USD', monthlyBudget: 50, remainingBudget: 50, lastSeen: new Date(), ...extra } });

await mk('u_author', cap.author, { monthlyBudget: 100, remainingBudget: 100 });
await mk('u_scanner', cap.newcomer, { monthlyBudget: 0, remainingBudget: 0 });
const conn = (a, b) => { const [x, y] = [a, b].sort(); return db.connection.create({ data: { userAId: x, userBId: y } }); };

let n = 0;
for (let i = 0; i < first.length; i++) {
  const id = `u_f${i}`;
  await mk(id, `${first[i]} ${initial(i)}.`);
  await conn('u_author', id);
  await db.inviteLink.create({ data: { inviterId: 'u_author', token: `demo-invite-${i}`, usedById: id, usedAt: new Date() } });
  for (let j = 0; j < 3; j++) {
    const sid = `u_s${i}_${j}`;
    await mk(sid, `${cyrillic ? 'Друг' : 'Friend'} ${++n}`);
    await conn(id, sid);
  }
}
console.log(`seeded [${lang}] users:`, await db.user.count(), 'connections:', await db.connection.count());
await db.$disconnect();
