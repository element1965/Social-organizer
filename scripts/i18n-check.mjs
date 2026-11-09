/**
 * Compare every locale in packages/i18n/locales with en.json and check that
 * every t('…') / i18nKey literal in the app source exists in en.json.
 *
 * A plural family is a base that has any _zero/_one/_two/_few/_many/_other
 * sibling in en.json. Each language must contain exactly the categories
 * Intl.PluralRules reports for it (CLDR). Forms the language does not use
 * are extra; forms it does use that en.json lacks are not extra.
 *
 * Exit code 1 when anything is wrong. Prints a short summary per file.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'packages', 'i18n', 'locales');
const SCAN_ROOTS = ['apps/web/src', 'apps/api/src', 'packages'].map((r) => join(ROOT, r));
const SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const SUFFIX_RE = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;
const TAG_RE = /<(\/?)([A-Za-z][\w-]*)/g;

export function flatten(value, prefix = '', out = {}) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}.${index}`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out[prefix] = value;
  }
  return out;
}

function walk(dir, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (name === 'node_modules' || name === 'dist' || name === '.turbo') continue;
    const path = join(dir, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(path, out);
    else if (['.ts', '.tsx', '.js', '.mjs'].includes(extname(name))) out.push(path);
  }
  return out;
}

function bindingsIn(source) {
  const map = new Map();
  const re = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"]+)\2/g;
  let match;
  while ((match = re.exec(source))) map.set(match[1], match[3]);
  return map;
}

function resolveTemplate(raw, bindings) {
  return raw.replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (full, id) => (bindings.has(id) ? bindings.get(id) : full));
}

function pluralCategories(lang) {
  try {
    return new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  } catch {
    return ['other'];
  }
}

function placeholders(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(PLACEHOLDER_RE)].map((m) => m[1]).sort();
}

function tags(value) {
  if (typeof value !== 'string') return [];
  const names = [];
  for (const match of value.matchAll(TAG_RE)) {
    if (match[1] !== '/') names.push(match[2]);
  }
  return names.sort();
}

function sameList(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item === b[i]);
}

/** Reference strings used in t(), i18nKey, tg() and returnObjects parents. */
export function collectUsage(enFlat) {
  const literals = new Set();
  const prefixes = new Set();
  const files = SCAN_ROOTS.flatMap((dir) => walk(dir)).filter(
    (file) => !file.includes(join('packages', 'i18n', 'locales')),
  );
  const callRe = /(?:(?<![\w.])t|i18n\.t|translate)\(\s*(['"`])([\s\S]*?)\1/g;
  const keyRe = /i18nKey\s*=\s*(?:\{\s*)?(['"`])([\s\S]*?)\1/g;
  const tgRe = /\btg\(\s*[^,]+,\s*(['"])([A-Za-z0-9_]+)\1/g;
  const tgBotChildren = new Set(
    Object.keys(enFlat)
      .filter((key) => key.startsWith('tgBot.'))
      .map((key) => key.slice('tgBot.'.length)),
  );

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const bindings = bindingsIn(source);
    for (const re of [callRe, keyRe]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(source))) {
        const resolved = resolveTemplate(match[2], bindings);
        if (!resolved) continue;
        if (resolved.includes('${')) {
          const head = resolved.split('${')[0];
          if (head) prefixes.add(head);
        } else {
          literals.add(resolved);
        }
      }
    }
    tgRe.lastIndex = 0;
    let tgMatch;
    let sawTg = false;
    while ((tgMatch = tgRe.exec(source))) {
      sawTg = true;
      literals.add(`tgBot.${tgMatch[2]}`);
    }
    if (sawTg || source.includes('tg(')) {
      const stringRe = /(['"])([A-Za-z][A-Za-z0-9_]*)\1/g;
      let str;
      while ((str = stringRe.exec(source))) {
        if (tgBotChildren.has(str[2])) literals.add(`tgBot.${str[2]}`);
      }
    }

    // Keys also live in ternaries, returned strings, and arrays (`t(cond ? 'a' : 'b')`,
    // `['legal.del.step1']`, `arr('how.table.says')`). Keep a literal when it is a real key
    // or the parent of one. Direct t()/i18nKey arguments above are kept either way, so a
    // typo in a call is still reported.
    const quotedRe = /(['"])([^'"\n\\]{1,180})\1/g;
    let quoted;
    while ((quoted = quotedRe.exec(source))) {
      const value = quoted[2];
      if (!value.includes('.')) continue;
      if (value in enFlat) literals.add(value);
      else if (Object.keys(enFlat).some((key) => key.startsWith(`${value}.`))) literals.add(value);
    }
  }

  const parents = new Set();
  for (const literal of literals) {
    if (literal in enFlat) continue;
    const dot = `${literal}.`;
    if (Object.keys(enFlat).some((key) => key.startsWith(dot))) parents.add(literal);
  }

  function isUsed(key) {
    if (literals.has(key)) return true;
    const base = key.replace(SUFFIX_RE, '');
    if (base !== key && literals.has(base)) return true;
    for (const prefix of prefixes) {
      if (key.startsWith(prefix) || base.startsWith(prefix)) return true;
    }
    for (const parent of parents) {
      if (key.startsWith(`${parent}.`)) return true;
    }
    return false;
  }

  function enHas(key) {
    if (key in enFlat) return true;
    const dot = `${key}.`;
    if (Object.keys(enFlat).some((item) => item.startsWith(dot))) return true;
    return SUFFIXES.some((suffix) => `${key}_${suffix}` in enFlat);
  }

  const missingInCode = [...literals].filter((key) => !enHas(key)).sort();
  const missingPrefixes = [...prefixes].filter(
    (prefix) => !Object.keys(enFlat).some((key) => key.startsWith(prefix)),
  ).sort();

  return { literals, prefixes, parents, isUsed, missingInCode, missingPrefixes, files: files.length };
}

function families(flat) {
  const bases = new Map();
  for (const key of Object.keys(flat)) {
    const match = key.match(SUFFIX_RE);
    if (!match) continue;
    const base = key.slice(0, -match[0].length);
    if (!bases.has(base)) bases.set(base, new Set());
    bases.get(base).add(match[1]);
  }
  return bases;
}

function referenceValue(enFlat, base, category, enForms) {
  if (enForms.has(category)) return enFlat[`${base}_${category}`];
  if (enForms.has('other')) return enFlat[`${base}_other`];
  if (enForms.has('one')) return enFlat[`${base}_one`];
  return undefined;
}

function checkLocale(lang, flat, enFlat, enFamilies) {
  const errors = [];
  const categories = new Set(pluralCategories(lang));
  const seen = new Set();

  for (const [base, enForms] of enFamilies) {
    for (const category of categories) {
      const key = `${base}_${category}`;
      seen.add(key);
      if (!(key in flat)) {
        errors.push(`plural ${key}`);
        continue;
      }
      const expected = referenceValue(enFlat, base, category, enForms);
      const actual = flat[key];
      if (typeof actual !== 'string') {
        errors.push(`type ${key}`);
        continue;
      }
      if (typeof expected === 'string') {
        if (!sameList(placeholders(expected), placeholders(actual))) errors.push(`placeholder ${key}`);
        if (!sameList(tags(expected), tags(actual))) errors.push(`tag ${key}`);
      }
    }
    for (const key of Object.keys(flat)) {
      const match = key.match(SUFFIX_RE);
      if (!match || key.slice(0, -match[0].length) !== base) continue;
      if (!categories.has(match[1])) errors.push(`extra ${key}`);
      seen.add(key);
    }
  }

  for (const [key, expected] of Object.entries(enFlat)) {
    if (SUFFIX_RE.test(key)) continue;
    seen.add(key);
    if (!(key in flat)) {
      errors.push(`missing ${key}`);
      continue;
    }
    const actual = flat[key];
    if (typeof expected === 'string') {
      if (typeof actual !== 'string') {
        errors.push(`type ${key}`);
        continue;
      }
      if (expected !== '' && actual === '') errors.push(`empty ${key}`);
      if (!sameList(placeholders(expected), placeholders(actual))) errors.push(`placeholder ${key}`);
      if (!sameList(tags(expected), tags(actual))) errors.push(`tag ${key}`);
    }
  }

  for (const key of Object.keys(flat)) {
    if (seen.has(key)) continue;
    if (SUFFIX_RE.test(key)) {
      const base = key.replace(SUFFIX_RE, '');
      if (enFamilies.has(base)) continue;
    }
    errors.push(`extra ${key}`);
  }

  return errors;
}

function summarise(file, errors) {
  if (errors.length === 0) {
    console.log(`${file}  ok`);
    return;
  }
  const buckets = new Map();
  for (const error of errors) {
    const kind = error.split(' ')[0];
    buckets.set(kind, (buckets.get(kind) ?? 0) + 1);
  }
  const parts = [...buckets.entries()].map(([kind, count]) => `${kind} ${count}`);
  const sample = errors.slice(0, 5).join('; ');
  console.log(`${file}  ${parts.join(', ')}  ${sample}`);
}

function main() {
  const enFlat = flatten(JSON.parse(readFileSync(join(LOCALES, 'en.json'), 'utf8')));
  const enFamilies = families(enFlat);
  const usage = collectUsage(enFlat);
  let total = 0;

  const files = readdirSync(LOCALES).filter((name) => name.endsWith('.json')).sort();
  for (const file of files) {
    const lang = file.replace(/\.json$/, '');
    const flat = flatten(JSON.parse(readFileSync(join(LOCALES, file), 'utf8')));
    const errors = lang === 'en' ? checkLocale(lang, enFlat, enFlat, enFamilies) : checkLocale(lang, flat, enFlat, enFamilies);
    total += errors.length;
    summarise(file, errors);
  }

  const codeErrors = [
    ...usage.missingInCode.map((key) => `missing ${key}`),
    ...usage.missingPrefixes.map((prefix) => `missing prefix ${prefix}`),
  ];
  total += codeErrors.length;
  summarise('code', codeErrors);

  console.log(`${files.length} locales, ${total} errors`);
  if (total > 0) process.exit(1);
}

const invoked = process.argv[1] && process.argv[1].endsWith('i18n-check.mjs');
if (invoked) main();
