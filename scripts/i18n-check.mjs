#!/usr/bin/env node
// Translation key parity (resgrid-i18n skill): every language file in each namespace must have exactly
// the keys of its English file. Namespaces live in packages/i18n/src/translations/<namespace>/<lang>.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const translationsDir = path.join(root, 'packages', 'i18n', 'src', 'translations');
const LANGUAGES = ['en', 'ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'sv', 'uk'];

const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

if (!fs.existsSync(translationsDir)) {
  console.log('No translations yet (packages/i18n/src/translations) — nothing to check.');
  process.exit(0);
}

const problems = [];
for (const ns of fs
  .readdirSync(translationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)) {
  const load = (lang) => JSON.parse(fs.readFileSync(path.join(translationsDir, ns, `${lang}.json`), 'utf8'));
  const enKeys = new Set(flatten(load('en')));
  for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
    const file = path.join(translationsDir, ns, `${lang}.json`);
    if (!fs.existsSync(file)) {
      problems.push(`${ns}/${lang}.json is missing`);
      continue;
    }
    const keys = new Set(flatten(load(lang)));
    for (const k of enKeys) if (!keys.has(k)) problems.push(`${ns}/${lang}: missing "${k}"`);
    for (const k of keys) if (!enKeys.has(k)) problems.push(`${ns}/${lang}: extra "${k}"`);
  }
}

if (problems.length) {
  console.error(`Translation parity failed (${problems.length}):\n- ${problems.slice(0, 50).join('\n- ')}`);
  process.exit(1);
}
console.log('Translation key parity OK.');
