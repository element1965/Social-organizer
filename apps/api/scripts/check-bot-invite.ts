/**
 * Local check of the bot's invite message: the numbers it shows are the inviter's own network, the same
 * network figure (people up to the 6th handshake and "Declared participation of the network") their Profile shows.
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
/** The web_app URL of the first button of each sent message. */
const buttons: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.includes('api.telegram.org')) throw new Error('unexpected request ' + url);
  const body = JSON.parse(init?.body ?? '{}');
  if (body.text) sent.push(body.text);
  const button = body.reply_markup?.inline_keyboard?.[0]?.[0]?.web_app?.url;
  if (button) buttons.push(button);
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

// A fresh chat id per run that no row uses yet, so the cleanup below only ever removes rows this run created
let chatId = 0;
for (let tries = 0; tries < 5 && !chatId; tries += 1) {
  const candidate = 900_000_000_000 + Math.floor(Math.random() * 1_000_000_000);
  const taken = (await db.botStart.count({ where: { chatId: String(candidate) } }))
    + (await db.platformAccount.count({ where: { platform: 'TELEGRAM', platformId: String(candidate) } }));
  if (!taken) chatId = candidate;
}
if (!chatId) { console.error('Could not find a free test chat id'); process.exit(1); }
const start = async (param: string, lang: string) => {
  sent.length = 0;
  buttons.length = 0;
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
const people = groupDigits(reach.people);
const usd = `${groupDigits(reach.canHelp)}\u00a0$`;
console.log(`Profile of ${inviter.name}: ${people} people, declared participation ${usd}`);

try {
  for (const lang of ['en', 'ru', 'de', 'ja']) {
    const text = await start(`invite_${inviter.id}`, lang);
    check(`${lang}: names the inviter`, text.includes(inviter.name));
    check(`${lang}: people = Profile`, text.includes(`: ${people}.`), JSON.stringify(text.split('\n')[3] ?? ''));
    check(`${lang}: declared = Profile`, text.includes(usd));
    check(`${lang}: no "mutual aid" wording`, !/mutual aid|взаимопомощ|gegenseitiger Hilfe|相互扶助/i.test(text));
  }

  const unknown = await start('invite_no-such-token-xyz', 'ru');
  check('unknown inviter: no numbers', !/\d+\s?\$/.test(unknown) && unknown.includes('Someone'), JSON.stringify(unknown.split('\n')[2] ?? ''));

  // "Learn more" opens the landing in the reader's language (a fresh link preview per language)
  const ruInvite = await start(`invite_${inviter.id}`, 'ru');
  check('ru: "Learn more" links /?lang=ru', /href="[^"]*\/\?lang=ru"/.test(ruInvite));
  const unsupported = await start(`invite_${inviter.id}`, 'xx');
  check('unknown language: "Learn more" links /?lang=en', /href="[^"]*\/\?lang=en"/.test(unsupported));

  // The inviter opening their own link: "This is your link", never an invitation to their own network.
  // A disposable person stands in for the inviter (the bot refreshes the linked account's lastSeen); deleting
  // them also removes their Telegram link.
  const ownInviter = await db.user.create({ data: { name: 'Own link check' }, select: { id: true } });
  try {
    await db.platformAccount.create({ data: { userId: ownInviter.id, platform: 'TELEGRAM', platformId: String(chatId) } });
    const own = await start(`invite_${ownInviter.id}`, 'ru');
    check('own link: says it is your link', own.includes('Это ваша ссылка'), JSON.stringify(own.split('\n')[2] ?? ''));
    check('own link: no invitation line', !own.includes('приглашает вас'));
    check('own link: button opens /invite/<token>', !!buttons[0]?.endsWith(`/invite/${ownInviter.id}`), buttons[0] ?? '(no button)');
  } finally {
    await db.user.delete({ where: { id: ownInviter.id } });
  }
} finally {
  // The handler records /start for reminders without waiting: remove this run's rows, then sweep once more
  // in case a slow write landed after the first pass
  for (let pass = 0; pass < 2; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await db.botStart.deleteMany({ where: { chatId: String(chatId) } });
  }
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
