#!/usr/bin/env node
/**
 * Sync missing locale keys from en.json to all other locales.
 * Copies English values as-is for keys that don't exist yet.
 * The app's i18next fallback will use English anyway, but this makes
 * the files consistent and ready for future translation.
 *
 * Usage: node scripts/sync-locales.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '..', 'packages', 'i18n', 'locales');

function flatten(obj, prefix = '') {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      Object.assign(result, flatten(val, p));
    } else {
      result[p] = val;
    }
  }
  return result;
}

function setNested(obj, dotPath, value) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

const enJson = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8'));
const enFlat = flatten(enJson);
const enKeys = Object.keys(enFlat);

const files = fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json') && f !== 'en.json' && f !== 'ru.json');

let totalAdded = 0;

for (const file of files) {
  const filePath = path.join(LOCALES_DIR, file);
  const langJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const langFlat = flatten(langJson);

  let added = 0;
  for (const key of enKeys) {
    if (!(key in langFlat)) {
      setNested(langJson, key, enFlat[key]);
      added++;
    }
  }

  if (added > 0) {
    fs.writeFileSync(filePath, JSON.stringify(langJson, null, 2) + '\n', 'utf8');
    console.log(`${file}: added ${added} keys`);
    totalAdded += added;
  } else {
    console.log(`${file}: up to date`);
  }
}

console.log(`\nDone! Added ${totalAdded} keys total across ${files.length} locales.`);
