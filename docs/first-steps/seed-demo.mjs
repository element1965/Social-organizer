// Seed an ISOLATED local demo DB (so_video_demo) for the first-steps videos. Never production.
// SEED_LANG=<locale> (default ru) sets users' language and the demo names from captions.mjs.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAPTIONS } from './captions.mjs';
const url = process.env.DATABASE_URL || '';
if (!/localhost:5434\/so_video_demo/.test(url)) { console.error('refusing: DATABASE_URL must be local so_video_demo'); process.exit(1); }
const lang = process.env.SEED_LANG || 'ru';
const cap = CAPTIONS[lang];
if (!cap) { console.error(`unknown SEED_LANG ${lang}`); process.exit(1); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { getDb } = await import(pathToFileURL(path.join(HERE, '../../packages/db/dist/index.js')).href);
const db = getDb();

await db.$executeRawUnsafe('TRUNCATE users CASCADE');

const cyrillic = ['ru', 'uk', 'be', 'sr'].includes(lang);
const first = cyrillic
  ? ['Ольга', 'Игорь', 'Марта', 'Денис', 'Света', 'Павел', 'Нина', 'Артём']
  : ['Olga', 'Igor', 'Marta', 'Denis', 'Sara', 'Paul', 'Nina', 'Adam'];
const initial = (i) => String.fromCharCode((cyrillic ? 1040 : 65) + i);
const mk = (id, name, extra = {}) => db.user.create({ data: { id, name, language: lang, onboardingCompleted: true, skillsCompleted: true, preferredCurrency: 'USD', monthlyBudget: 50, remainingBudget: 50, lastSeen: new Date(), ...extra } });
const conn = (a, b) => { const [x, y] = [a, b].sort(); return db.connection.create({ data: { userAId: x, userBId: y } }); };

// u_inviter: the person who sent the link (video "invite-link"); u_friend: the friend who opens
// the newcomer's link (video "app-start"). Both have their own circle, so the 2nd handshake is not empty.
await mk('u_inviter', cap.inviter, { monthlyBudget: 100, remainingBudget: 100 });
await mk('u_friend', cap.friend);
await mk('u_new', cap.newcomer);
let n = 0;
for (let i = 0; i < first.length; i++) {
  const id = `u_f${i}`;
  await mk(id, `${first[i]} ${initial(i)}.`);
  await conn('u_inviter', id);
  if (i < 3) { const sid = `u_s${i}`; await mk(sid, `${cyrillic ? 'Друг' : 'Friend'} ${++n}`); await conn('u_friend', sid); }
}
await db.inviteLink.create({ data: { inviterId: 'u_inviter', token: 'demo-invite' } });
console.log(`seeded [${lang}] users:`, await db.user.count(), 'connections:', await db.connection.count());
await db.$disconnect();
