import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@so/db';
import { findSosPreview, pickLanguage, renderSosPreview } from '../src/services/invite-preview.service.js';

const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
const url = 'https://example.org/sos/need12345';
const meta = (page: string, key: string) =>
  page.match(new RegExp(`<meta property="${key}" content="([^"]*)"`))?.[1];

const states = [
  { status: 'ACTIVE', blockReason: null, en: 'By joining, you confirm that you know this person personally.', ru: 'Присоединяясь, вы подтверждаете, что знаете этого человека лично.' },
  { status: 'BLOCKED', blockReason: null, en: 'The amount needed is reported.', ru: 'Нужная сумма заявлена.' },
  { status: 'BLOCKED', blockReason: 'COMPLAINTS', en: 'This Need is paused.', ru: 'Потребность приостановлена.' },
  { status: 'CLOSED', blockReason: null, en: 'This Need is closed.', ru: 'Потребность закрыта.' },
];

for (const name of ['Марко', 'Любовь', 'Ольга']) {
  for (const { status, blockReason, en, ru } of states) {
    // Supply only the selected DB fields. The public preview pipeline runs without touching Postgres.
    const db = {
      collection: {
        findUnique: async () => ({ status, blockReason, creator: { name: `${name} Фамилия`, photoUrl: null, language: 'ru', deletedAt: null } }),
      },
    } as unknown as PrismaClient;
    const preview = await findSosPreview(db, 'need12345');
    assert.ok(preview);
    for (const [requested, title, description] of [
      ['ru-RU', `${name} просит о содействии`, ru],
      ['en', `${name} needs assistance`, en],
    ]) {
      const lang = pickLanguage(requested, undefined, preview.language);
      const page = renderSosPreview(html, preview, { lang, url, origin: 'https://example.org' });
      assert.equal(meta(page, 'og:title'), title);
      assert.equal(meta(page, 'og:description'), description);
    }
  }
}

console.log('Public Need preview passed for three names, four states and two languages.');
