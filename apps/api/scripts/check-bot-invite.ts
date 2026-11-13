/**
 * Local check of the bot's invite message: the numbers it shows are the inviter's own network, the same
 * "people in the visible rings 1–3" and "Declared participation of the network" their Profile shows.
 * Runs the real /start handler against a LOCAL database; Telegram calls are intercepted, nothing leaves.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=<local db> TELEGRAM_BOT_TOKEN=local-test npx tsx scripts/check-bot-invite.ts
 */
import { getDb } from '@so/db';

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL is not a local database.');
  process.exit(1);
}
if (!process.env.TELEGRAM_BOT_TOKEN) { console.error('TELEGRAM_BOT_TOKEN is required (any value)'); process.exit(1); }

const sent: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.includes('api.telegram.org')) throw new Error('unexpected request ' + url);
  const body = JSON.parse(init?.body ?? '{}');
  if (body.text) sent.push(body.text);
  return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
}) as typeof fetch;

const { handleTelegramUpdate, groupDigits } = await import('../src/services/telegram-bot.service.js');
const { networkReach } = await import('../src/services/network.service.js');

const db = getDb();
let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!ok) failed += 1;
};

const chatId = 990000001;
const start = async (param: string, lang: string) => {
  sent.length = 0;
  await handleTelegramUpdate({
    update_id: 1,
    message: { message_id: 1, chat: { id: chatId, type: 'private' }, date: 0, text: `/start ${param}`, from: { id: chatId, is_bot: false, first_name: 'Test', language_code: lang } },
  } as any);
  return sent[0] ?? '';
};

const inviter = await db.user.findFirst({ where: { email: 'anna@test.local', deletedAt: null }, select: { id: true, name: true } });
if (!inviter) {
  console.error('Seed user anna@test.local not found: run packages/db/prisma/seed-dev.ts first.');
  process.exit(1);
}
const reach = await networkReach(db, inviter.id);
const people = groupDigits(reach.visible);
const usd = `${groupDigits(reach.canHelpVisible)} $`;
console.log(`Profile of ${inviter.name}: ${people} people, declared participation ${usd}`);

for (const lang of ['en', 'ru', 'de', 'ja']) {
  const text = await start(`invite_${inviter.id}`, lang);
  check(`${lang}: names the inviter`, text.includes(inviter.name));
  check(`${lang}: people = Profile`, text.includes(`: ${people}.`), JSON.stringify(text.split('\n')[3] ?? ''));
  check(`${lang}: declared = Profile`, text.includes(usd));
  check(`${lang}: no "mutual aid" wording`, !/mutual aid|взаимопомощ|gegenseitiger Hilfe|相互扶助/i.test(text));
}

const unknown = await start('invite_no-such-token-xyz', 'ru');
check('unknown inviter: no numbers', !/\d+\s?\$/.test(unknown) && unknown.includes('Someone'), JSON.stringify(unknown.split('\n')[2] ?? ''));

// The handler records /start for reminders; remove what this check created
await db.botStart.deleteMany({ where: { chatId: String(chatId) } }).catch(() => undefined);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
