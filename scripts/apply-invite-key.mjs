import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '..', 'packages', 'i18n', 'locales');

const translations = {
  ar: 'دعوة',
  cs: 'Pozvat',
  da: 'Inviter',
  de: 'Einladen',
  es: 'Invitar',
  fi: 'Kutsu',
  fr: 'Inviter',
  he: 'הזמן',
  hi: 'आमंत्रित करें',
  id: 'Undang',
  it: 'Invita',
  ja: '招待する',
  ko: '초대',
  nl: 'Uitnodigen',
  no: 'Inviter',
  pl: 'Zaproś',
  pt: 'Convidar',
  ro: 'Invită',
  sr: 'Позовите',
  sv: 'Bjud in',
  th: 'เชิญ',
  tr: 'Davet et',
  uk: 'Запросити',
  vi: 'Mời',
  zh: '邀请',
};

for (const [lang, value] of Object.entries(translations)) {
  const filePath = path.join(localesDir, `${lang}.json`);
  if (!fs.existsSync(filePath)) continue;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!data.create) data.create = {};
  data.create.goToInvite = value;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`Updated ${lang}.json`);
}
console.log('Done!');
