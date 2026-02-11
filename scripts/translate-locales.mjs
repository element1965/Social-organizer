#!/usr/bin/env node
/**
 * Translate missing locale keys from en.json to all other locales (except ru.json).
 * Uses xAI Grok API with fallback to OpenAI.
 *
 * Usage: node scripts/translate-locales.mjs
 * Env: XAI_API_KEY, OPENAI_API_KEY
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '..', 'packages', 'i18n', 'locales');

const LANG_NAMES = {
  ar: 'Arabic', cs: 'Czech', da: 'Danish', de: 'German', es: 'Spanish',
  fi: 'Finnish', fr: 'French', he: 'Hebrew', hi: 'Hindi', id: 'Indonesian',
  it: 'Italian', ja: 'Japanese', ko: 'Korean', nl: 'Dutch', no: 'Norwegian',
  pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', sr: 'Serbian', sv: 'Swedish',
  th: 'Thai', tr: 'Turkish', uk: 'Ukrainian', vi: 'Vietnamese', zh: 'Chinese',
};

// Flatten nested JSON to dot-notation keys
function flatten(obj, prefix = '') {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      Object.assign(result, flatten(val, path));
    } else {
      result[path] = val;
    }
  }
  return result;
}

// Unflatten dot-notation keys back to nested object
function unflatten(obj) {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const parts = key.split('.');
    let cur = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }
  return result;
}

// Deep merge source into target (only adds missing keys)
function deepMerge(target, source) {
  for (const [key, val] of Object.entries(source)) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], val);
    } else if (!(key in target)) {
      target[key] = val;
    }
  }
  return target;
}

async function callGrok(systemPrompt, userPrompt) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('No XAI_API_KEY');

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'grok-3-mini',
      max_tokens: 4000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Grok API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('No OPENAI_API_KEY');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 4000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callLLM(systemPrompt, userPrompt) {
  try {
    return await callGrok(systemPrompt, userPrompt);
  } catch (err) {
    console.warn(`  Grok failed: ${err.message}, trying OpenAI...`);
    return await callOpenAI(systemPrompt, userPrompt);
  }
}

async function translateBatch(missingKeys, enFlat, langName) {
  const toTranslate = {};
  for (const key of missingKeys) {
    toTranslate[key] = enFlat[key];
  }

  const systemPrompt = `You are a professional translator. Translate the following JSON values from English to ${langName}. Return ONLY valid JSON with the same keys and translated values. Do not translate placeholders like {{count}}, {{name}}, etc. — keep them as-is. Do not add markdown formatting.`;
  const userPrompt = JSON.stringify(toTranslate, null, 2);

  const result = await callLLM(systemPrompt, userPrompt);
  try {
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`  Failed to parse translation result: ${err.message}`);
    console.error(`  Raw result: ${result.slice(0, 200)}...`);
    return {};
  }
}

async function main() {
  const enJson = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8'));
  const enFlat = flatten(enJson);
  const enKeys = new Set(Object.keys(enFlat));

  console.log(`Reference: en.json has ${enKeys.size} keys`);

  const locales = Object.keys(LANG_NAMES);
  let totalTranslated = 0;

  for (const lang of locales) {
    const filePath = path.join(LOCALES_DIR, `${lang}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`${lang}: file not found, skipping`);
      continue;
    }

    const langJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const langFlat = flatten(langJson);
    const langKeys = new Set(Object.keys(langFlat));

    const missing = [...enKeys].filter(k => !langKeys.has(k));
    if (missing.length === 0) {
      console.log(`${lang}: up to date`);
      continue;
    }

    console.log(`${lang} (${LANG_NAMES[lang]}): ${missing.length} missing keys`);

    // Translate in batches of 50
    const BATCH_SIZE = 50;
    const allTranslated = {};

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      console.log(`  Translating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(missing.length / BATCH_SIZE)} (${batch.length} keys)...`);
      const translated = await translateBatch(batch, enFlat, LANG_NAMES[lang]);
      Object.assign(allTranslated, translated);
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    }

    // Merge translations into the locale file
    const translatedNested = unflatten(allTranslated);
    const merged = deepMerge(langJson, translatedNested);

    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    const translatedCount = Object.keys(allTranslated).length;
    totalTranslated += translatedCount;
    console.log(`  Saved ${translatedCount} translations to ${lang}.json`);
  }

  console.log(`\nDone! Translated ${totalTranslated} keys total.`);
}

main().catch(console.error);
