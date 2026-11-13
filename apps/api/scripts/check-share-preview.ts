/**
 * Local check of the link card of a public Need page (/sos/:id) and of the guest counter for it.
 * Real services and tRPC procedures against a LOCAL database; nothing leaves the machine.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=postgresql://postgres:<password>@localhost:5434/<local db>?schema=public JWT_SECRET=<16+ chars> npx tsx scripts/check-share-preview.ts
 *
 * Never point DATABASE_URL at production: the script creates and deletes test rows (ids start with "sp-").
 */
import { getDb } from '@so/db';

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL is not a local database.');
  process.exit(1);
}
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.REDIS_URL;

const { appRouter } = await import('../src/routers/index.js');
const { findSosPreview, renderSosPreview, findInvitePreview, renderInvitePreview } = await import('../src/services/invite-preview.service.js');

const db = getDb();
const P = 'sp-';
const id = (s: string) => `${P}${s}`;
const call = (userId: string | null) => appRouter.createCaller({ db, userId, ip: '127.0.0.1' } as any);

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const HTML = `<!doctype html><html lang="en"><head><title>Social Organizer</title>
<meta name="description" content="site" />
<meta property="og:title" content="site" />
<meta property="og:description" content="site" />
<meta property="og:url" content="https://example.org/" />
<meta property="og:image" content="https://example.org/og.png" />
<meta property="og:image:width" content="1200" />
<meta name="twitter:card" content="summary_large_image" />
</head><body><div id="root"></div></body></html>`;
const meta = (html: string, key: string) => html.match(new RegExp(`(?:property|name)="${key}" content="([^"]*)"`))?.[1] ?? null;
const opens = async () =>
  Number((await db.$queryRaw<Array<{ n: number }>>`
    SELECT COALESCE(SUM(count), 0)::int AS n FROM invite_open_days WHERE day = CURRENT_DATE AND source = 'need'
  `)[0]?.n ?? 0);

async function cleanup() {
  await db.user.deleteMany({ where: { id: { startsWith: P } } });
}

try {
  await cleanup();
  await db.user.createMany({
    data: [
      { id: id('anna'), name: 'Анна Петрова', language: 'ru', photoUrl: 'https://example.org/anna.jpg' },
      { id: id('max'), name: 'Max <b>Stone</b>', language: 'en' },
    ],
  });
  const make = (creatorId: string, extra: Record<string, unknown> = {}) =>
    db.collection.create({
      data: { creatorId, type: 'EMERGENCY', amount: 300, currency: 'USD', chatLink: 'https://t.me/sp_check', description: 'private words', ...extra },
    });
  const open = await make(id('anna'));
  const closed = await make(id('max'), { status: 'CLOSED', closedAt: new Date() });
  const full = await make(id('max'), { status: 'BLOCKED' });
  const paused = await make(id('max'), { status: 'BLOCKED', blockReason: 'COMPLAINTS' });

  /* ---------- What the card is built from ---------- */
  const p = await findSosPreview(db, open.id);
  check('an open Need gives the author and the "open" state', p?.name === 'Анна Петрова' && p.state === 'open' && p.language === 'ru');
  check('states: closed, amount reported, paused',
    (await findSosPreview(db, closed.id))?.state === 'closed' &&
    (await findSosPreview(db, full.id))?.state === 'full' &&
    (await findSosPreview(db, paused.id))?.state === 'paused');
  check('an unknown or malformed id gives nothing', (await findSosPreview(db, 'nosuchcollection1')) === null && (await findSosPreview(db, '../etc')) === null);

  /* ---------- The card itself ---------- */
  const url = `https://example.org/sos/${open.id}`;
  const ru = renderSosPreview(HTML, p!, { lang: 'ru', url, origin: 'https://example.org' });
  check('Russian title puts the name in the dative, as the page does', meta(ru, 'og:title') === 'Анне нужно содействие', String(meta(ru, 'og:title')));
  check('the page title is the same sentence', /<title>Анне нужно содействие<\/title>/.test(ru));
  check('the description says who the page is for', (meta(ru, 'og:description') ?? '').includes('знаете этого человека'), String(meta(ru, 'og:description')));
  check('the picture is the author\'s photo, as a small card',
    meta(ru, 'og:image') === 'https://example.org/anna.jpg' && meta(ru, 'twitter:card') === 'summary' && meta(ru, 'og:image:width') === null);
  check('the card points at the Need page', meta(ru, 'og:url') === url && /<html lang="ru"/.test(ru));
  // The address is taken out first: a generated id may contain the digits of the amount by chance
  check('no amount and no description text in the card', !ru.split(open.id).join('').includes('300') && !ru.includes('private words'));

  const en = renderSosPreview(HTML, p!, { lang: 'en', url, origin: 'https://example.org' });
  check('other languages use the first name as written', meta(en, 'og:title') === 'Анна needs assistance', String(meta(en, 'og:title')));

  const closedCard = renderSosPreview(HTML, (await findSosPreview(db, closed.id))!, { lang: 'en', url, origin: 'https://example.org' });
  check('a closed Need says so instead of inviting', meta(closedCard, 'og:description') === 'This Need is closed.', String(meta(closedCard, 'og:description')));
  check('a name with markup is escaped', !closedCard.includes('<b>') && (meta(closedCard, 'og:title') ?? '').startsWith('Max '), String(meta(closedCard, 'og:title')));
  check('no photo keeps the site picture', meta(closedCard, 'og:image') === 'https://example.org/og.png');

  /* ---------- The invite card still works after the shared writer ---------- */
  const inv = await findInvitePreview(db, id('anna'));
  const invCard = renderInvitePreview(HTML, inv!, { lang: 'en', url: 'https://example.org/i/x', origin: 'https://example.org', to: 'Vanya' });
  check('the invite card is unchanged: addressee, name, photo',
    (meta(invCard, 'og:title') ?? '').startsWith('Vanya, Анна Петрова') && meta(invCard, 'og:image') === 'https://example.org/anna.jpg',
    String(meta(invCard, 'og:title')));

  /* ---------- Guests of a Need page are counted as "need" ---------- */
  const before = await opens();
  await call(null).invite.opened({ kind: 'need' });
  check('a guest opening a Need page is counted for the source "need"', (await opens()) === before + 1);
} finally {
  await db.$executeRaw`
    UPDATE invite_open_days SET count = GREATEST(count - 1, 0) WHERE day = CURRENT_DATE AND source = 'need'
  `.catch(() => {});
  await db.$executeRaw`DELETE FROM invite_open_days WHERE count = 0`.catch(() => {});
  await cleanup();
  await db.$disconnect();
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
