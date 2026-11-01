#!/usr/bin/env node
// Merges the five legacy apps' translation files into Omni's namespaced translations (omni-plan §7.12,
// resgrid-i18n skill). Reproducible: run it again after the legacy repos move and review the diff.
//
//   node packages/i18n/scripts/merge-legacy-translations.mjs [--legacy-root <dir>] [--out <dir>] [--review <dir>] [--no-git]
//
// Reads  <legacy-root>/{Responder,Unit,IC,Dispatch,BigBoard}/src/translations/<lang>.json (read-only).
// Writes <out>/<namespace>/<lang>.json for namespaces common, responder, unit, ic, dispatch, bigboard,
// and review CSVs under <review>.
//
// Rules (also summarised in review/summary.json):
//  1. Scaffold leftovers are dropped: any key whose English value mentions "obytes" or "app site".
//  2. Duplicate namespaces are merged: weatherAlerts → weather_alerts, videoFeeds → video_feeds, poi → pois.
//  3. Each app's own product name ("Resgrid Unit" in Unit's files, ...) becomes {{appName}} in every language.
//  4. Namespace: a key present in 2+ apps goes to `common`; a key present in one app goes to that app's
//     namespace. (Keys in ≥ 4 apps are common by the plan; keys in 2–3 apps go to common too, so a string
//     two apps share is never duplicated and cannot drift again.)
//  5. English conflicts (same key, different English across apps): the preferred app's value goes to
//     `common`. Preference is per key family (KEY_PREFERENCES below); otherwise the wording used by the most
//     apps, ties broken by the most recently changed line (git blame), then app order R, U, I, D, B.
//     Apps whose English differs only in case, trailing punctuation or whitespace adopt the common value.
//     Apps whose wording really differs keep it as an override in their own namespace (the variant namespace
//     is read before `common`), so no shipped screen changes wording; every conflict is listed in
//     review/en-conflicts.csv for a human decision. Keys in FORCE_UNIFY always adopt the common value.
//  6. Non-English values for a shared key come from the apps whose English equals the chosen English.
//     When those apps disagree: prefer a value whose {{placeholders}} match the English, then a value that is
//     actually translated (differs from English), then the most recently changed line (git blame per key,
//     falling back to the file's last commit), then app order. Listed in review/translation-divergence.csv.
//     A chosen value whose placeholders still differ from the English is listed in review/placeholder-mismatches.csv;
//     a bare "{{appName}}" title is never translated.
//  7. Every language file of a namespace has exactly the English keys; a missing value is filled from
//     English and listed in review/missing-translations.csv.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const LANGUAGES = ['en', 'ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'sv', 'uk'];
export const NAMESPACES = ['common', 'responder', 'unit', 'ic', 'dispatch', 'bigboard'];

export const APPS = [
  { code: 'R', repo: 'Responder', ns: 'responder', productName: 'Resgrid Responder' },
  { code: 'U', repo: 'Unit', ns: 'unit', productName: 'Resgrid Unit' },
  { code: 'I', repo: 'IC', ns: 'ic', productName: 'Resgrid IC' },
  { code: 'D', repo: 'Dispatch', ns: 'dispatch', productName: 'Resgrid Dispatch' },
  { code: 'B', repo: 'BigBoard', ns: 'bigboard', productName: 'Resgrid BigBoard' },
];
const APP_ORDER = APPS.map((a) => a.code);

const NAMESPACE_RENAMES = [
  ['weatherAlerts', 'weather_alerts'],
  ['videoFeeds', 'video_feeds'],
  ['poi', 'pois'],
];

const SCAFFOLD_PATTERN = /\bobytes\b|\bapp site\b/i;

// English conflict preference, first match wins. `order` lists app codes; apps not listed rank after.
// Families follow the owner's guidance: Responder for sign-in/settings/common wording (its copy is the most
// recently reviewed), Dispatch for call fields, IC for incident command, Unit for check-in timers and the
// active-unit concept. Refined against i18n-conflicts.tsv.
export const KEY_PREFERENCES = [
  { pattern: /^form\.invalid_url$/, order: ['D'], why: 'https only, http only for localhost (AGENTS.md security rule)' },
  { pattern: /^common\.noActiveUnit/, order: ['U', 'D', 'B', 'I', 'R'], why: 'active unit is a Unit concept' },
  { pattern: /^(app|common|login|settings|mfa|sso|lockscreen|onboarding|account_security|push_notifications|maintenance)\./, order: ['R', 'U', 'I', 'D', 'B'], why: 'Responder sign-in/settings wording' },
  { pattern: /^(calls|call_detail|callImages|callNotes|callFiles|call_files|dispatch|scheduled_calls)\./, order: ['D', 'R', 'U', 'I', 'B'], why: 'Dispatch call fields' },
  { pattern: /^incident_command\./, order: ['I', 'U', 'R', 'D', 'B'], why: 'IC owns incident command' },
  { pattern: /^check_in\./, order: ['U', 'I', 'R', 'D', 'B'], why: 'Unit owns check-in timers' },
];

// Conflicts where the other apps' wording is wrong for Omni, so no override is kept.
export const FORCE_UNIFY = new Set(['form.invalid_url']);

// ---------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------

export const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
};

const compareKeys = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const unflatten = (flat) => {
  const root = {};
  for (const key of Object.keys(flat).sort(compareKeys)) {
    const parts = key.split('.');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof node[part] === 'string') throw new Error(`Key collision: "${parts.slice(0, i + 1).join('.')}" is both a string and a namespace (while adding "${key}")`);
      node[part] = node[part] ?? {};
      node = node[part];
    }
    const leaf = parts[parts.length - 1];
    if (node[leaf] !== undefined && typeof node[leaf] === 'object') throw new Error(`Key collision: "${key}" is both a string and a namespace`);
    node[leaf] = flat[key];
  }
  return sortDeep(root);
};

const sortDeep = (node) => {
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const k of Object.keys(node).sort(compareKeys)) out[k] = sortDeep(node[k]);
  return out;
};

export const renameKey = (key) => {
  for (const [from, to] of NAMESPACE_RENAMES) {
    if (key === from || key.startsWith(`${from}.`)) return `${to}${key.slice(from.length)}`;
  }
  return key;
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const substituteAppName = (value, productName) => value.replace(new RegExp(`${escapeRegExp(productName)}\\b`, 'g'), '{{appName}}');

/** Case, trailing punctuation and whitespace only: "Loading" vs "Loading...", "OK" vs "Ok". */
export const trivialForm = (s) =>
  s
    .toLowerCase()
    .replace(/(\.\.\.|…|[.:!])+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();

export const placeholders = (s) => [...new Set([...String(s).matchAll(/\{\{\s*([^}\s,]+)[^}]*\}\}/g)].map((m) => m[1]))].sort().join(',');

const csvField = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(csvField).join(',')).join('\n') + '\n';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));

// ---------------------------------------------------------------------------------------------------------
// Git recency (read-only)
// ---------------------------------------------------------------------------------------------------------

const git = (repoDir, args) => execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const fileCommitTime = (repoDir, rel) => {
  try {
    const out = git(repoDir, ['log', '-1', '--format=%ct', '--', rel]).trim();
    return out ? Number(out) : 0;
  } catch {
    return 0;
  }
};

/** Maps each line of a pretty-printed translation file to the flattened key it defines (null for structure lines). */
export const keysByLine = (text) => {
  const stack = [];
  return text.split(/\r?\n/).map((line) => {
    const m = /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*(\{|")/.exec(line);
    if (m) {
      const name = JSON.parse(`"${m[1]}"`);
      const full = [...stack, name].join('.');
      if (m[2] === '{') {
        if (!/\}\s*,?\s*$/.test(line)) stack.push(name);
        return null;
      }
      return full;
    }
    if (/^\s*\}\s*,?\s*$/.test(line)) stack.pop();
    return null;
  });
};

/**
 * Per-key last-change time from `git blame`, so a key fixed recently in one app wins over a bulk commit that
 * merely touched the file. Falls back to the file's last commit time when the file is not pretty-printed one
 * key per line, and to 0 when git is unavailable.
 */
const keyTimes = (repoDir, rel, expectedKeys, useGit) => {
  const times = new Map();
  if (!useGit) return { times, fileTime: 0 };
  const fileTime = fileCommitTime(repoDir, rel);
  try {
    const text = fs.readFileSync(path.join(repoDir, rel), 'utf8').replace(/^﻿/, '');
    const lineKeys = keysByLine(text);
    const porcelain = git(repoDir, ['blame', '--line-porcelain', '--', rel]);
    let current = 0;
    let lineIndex = 0;
    for (const line of porcelain.split('\n')) {
      if (line.startsWith('committer-time ')) current = Number(line.slice(15));
      else if (line.startsWith('\t')) {
        const key = lineKeys[lineIndex++];
        if (key) times.set(key, current);
      }
    }
    const complete = expectedKeys.every((k) => times.has(k));
    if (!complete) times.clear();
  } catch {
    times.clear();
  }
  return { times, fileTime };
};

// ---------------------------------------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------------------------------------

const loadApp = (legacyRoot, app, useGit, keyChanges) => {
  const repoDir = path.join(legacyRoot, app.repo);
  const values = {};
  const times = {};
  for (const lang of LANGUAGES) {
    const rel = `src/translations/${lang}.json`;
    const file = path.join(repoDir, rel);
    const flat = fs.existsSync(file) ? flatten(readJson(file)) : {};
    values[lang] = flat;
    times[lang] = keyTimes(repoDir, rel, Object.keys(flat), useGit);
  }
  if (!Object.keys(values.en).length) throw new Error(`No English translations found for ${app.repo} under ${repoDir}`);

  const out = { values: {}, times: {} };
  const dropped = new Set();
  for (const [key, en] of Object.entries(values.en)) {
    if (typeof en !== 'string' || en.trim() === '') {
      dropped.add(key);
      keyChanges.push([app.code, key, 'dropped-empty', '']);
    } else if (SCAFFOLD_PATTERN.test(en)) {
      dropped.add(key);
      keyChanges.push([app.code, key, 'dropped-scaffold', en]);
    }
  }
  for (const lang of LANGUAGES) {
    out.values[lang] = {};
    out.times[lang] = { byKey: new Map(), fileTime: times[lang].fileTime };
    for (const [key, raw] of Object.entries(values[lang])) {
      if (dropped.has(key) || !(key in values.en) || typeof raw !== 'string') continue;
      const newKey = renameKey(key);
      if (lang === 'en' && newKey !== key) keyChanges.push([app.code, key, 'renamed', newKey]);
      const value = substituteAppName(raw, app.productName);
      if (lang === 'en' && value !== raw) keyChanges.push([app.code, newKey, 'app-name', `${raw} -> ${value}`]);
      out.values[lang][newKey] = value;
      const t = times[lang].times.get(key);
      if (t !== undefined) out.times[lang].byKey.set(newKey, t);
    }
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------------------------------------

export function mergeTranslations({ legacyRoot, useGit = true }) {
  const keyChanges = [];
  const data = {};
  for (const app of APPS) data[app.code] = loadApp(legacyRoot, app, useGit, keyChanges);

  const timeOf = (code, lang, key) => {
    const t = data[code].times[lang];
    return t.byKey.get(key) ?? t.fileTime;
  };
  const nsOf = Object.fromEntries(APPS.map((a) => [a.code, a.ns]));

  /** namespace -> key -> { en, candidates: codes, fallback: codes } */
  const entries = Object.fromEntries(NAMESPACES.map((ns) => [ns, new Map()]));
  const conflictRows = [];

  const allKeys = new Set();
  for (const code of APP_ORDER) for (const key of Object.keys(data[code].values.en)) allKeys.add(key);

  for (const key of [...allKeys].sort(compareKeys)) {
    const present = APP_ORDER.filter((code) => key in data[code].values.en);
    const en = Object.fromEntries(present.map((code) => [code, data[code].values.en[key]]));
    const distinct = [...new Set(present.map((code) => en[code]))];

    if (present.length === 1) {
      entries[nsOf[present[0]]].set(key, { en: en[present[0]], candidates: present, fallback: [] });
      continue;
    }
    if (distinct.length === 1) {
      entries.common.set(key, { en: distinct[0], candidates: present, fallback: [] });
      continue;
    }

    // English conflict.
    const family = KEY_PREFERENCES.find((p) => p.pattern.test(key));
    let chosenCode;
    let rule;
    if (family) {
      chosenCode = family.order.find((code) => present.includes(code)) ?? null;
      rule = `family: ${family.why}`;
    }
    if (!chosenCode) {
      const votes = (code) => present.filter((c) => en[c] === en[code]).length;
      chosenCode = [...present].sort((a, b) => votes(b) - votes(a) || timeOf(b, 'en', key) - timeOf(a, 'en', key) || APP_ORDER.indexOf(a) - APP_ORDER.indexOf(b))[0];
      rule = votes(chosenCode) > 1 ? 'majority' : 'most recently changed';
    }
    const chosen = en[chosenCode];
    const exact = present.filter((code) => en[code] === chosen);
    const trivial = present.filter((code) => en[code] !== chosen && (trivialForm(en[code]) === trivialForm(chosen) || FORCE_UNIFY.has(key)));
    const overrides = present.filter((code) => !exact.includes(code) && !trivial.includes(code));

    entries.common.set(key, { en: chosen, candidates: exact, fallback: trivial });
    for (const code of overrides) entries[nsOf[code]].set(key, { en: en[code], candidates: [code], fallback: [] });

    conflictRows.push([key, chosen, exact.join(''), rule, overrides.length ? `override kept for ${overrides.join('')}` : 'unified', ...APP_ORDER.map((code) => (code in en ? en[code] : ''))]);
  }

  // Non-English values.
  const divergenceRows = [];
  const missingRows = [];
  const placeholderRows = [];
  const output = Object.fromEntries(NAMESPACES.map((ns) => [ns, Object.fromEntries(LANGUAGES.map((l) => [l, {}]))]));

  for (const ns of NAMESPACES) {
    for (const [key, entry] of [...entries[ns].entries()].sort((a, b) => compareKeys(a[0], b[0]))) {
      output[ns].en[key] = entry.en;
      const enPlaceholders = placeholders(entry.en);
      for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
        const collect = (codes) => codes.map((code) => ({ code, value: data[code].values[lang][key], time: timeOf(code, lang, key) })).filter((c) => typeof c.value === 'string' && c.value.trim() !== '');
        let candidates = collect(entry.candidates);
        if (!candidates.length) candidates = collect(entry.fallback);
        if (!candidates.length) {
          output[ns][lang][key] = entry.en;
          missingRows.push([ns, key, lang, entry.en]);
          continue;
        }
        const score = (c) => [placeholders(c.value) === enPlaceholders ? 1 : 0, c.value !== entry.en ? 1 : 0, c.time, -APP_ORDER.indexOf(c.code)];
        const ranked = [...candidates].sort((a, b) => {
          const sa = score(a);
          const sb = score(b);
          for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i];
          return 0;
        });
        const best = ranked[0];
        // A bare product-name title ("{{appName}}") is never translated; several files transliterate it instead.
        output[ns][lang][key] = entry.en === '{{appName}}' ? entry.en : best.value;
        if (output[ns][lang][key] !== entry.en && placeholders(output[ns][lang][key]) !== enPlaceholders) {
          placeholderRows.push([ns, key, lang, entry.en, output[ns][lang][key]]);
        }
        const distinctValues = new Set(candidates.map((c) => c.value));
        if (distinctValues.size > 1) {
          const runnerUp = ranked.find((c) => c.value !== best.value);
          const [b0, b1, b2] = score(best);
          const [r0, r1, r2] = score(runnerUp);
          const reason = b0 !== r0 ? 'placeholders match English' : b1 !== r1 ? 'translated over untranslated' : b2 !== r2 ? 'most recently changed' : 'app order';
          divergenceRows.push([ns, key, lang, best.value, best.code, reason, candidates.map((c) => `${c.code}=${c.value}`).join(' | ')]);
        }
      }
    }
  }

  return { output, conflictRows, divergenceRows, missingRows, placeholderRows, keyChanges };
}

// ---------------------------------------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------------------------------------

export function writeOutputs({ output, conflictRows, divergenceRows, missingRows, placeholderRows, keyChanges }, { outDir, reviewDir }) {
  const summary = {
    rules: 'see header of packages/i18n/scripts/merge-legacy-translations.mjs',
    namespaces: {},
    enConflicts: conflictRows.length,
    enConflictOverrides: conflictRows.filter((r) => r[4] !== 'unified').length,
    translationDivergence: divergenceRows.length,
    placeholderMismatches: placeholderRows.length,
    missingTranslations: {},
  };
  for (const ns of NAMESPACES) {
    const dir = path.join(outDir, ns);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) fs.rmSync(path.join(dir, f));
    for (const lang of LANGUAGES) {
      fs.writeFileSync(path.join(dir, `${lang}.json`), JSON.stringify(unflatten(output[ns][lang]), null, 2) + '\n');
    }
    summary.namespaces[ns] = Object.keys(output[ns].en).length;
  }
  for (const lang of LANGUAGES.filter((l) => l !== 'en')) summary.missingTranslations[lang] = missingRows.filter((r) => r[2] === lang).length;

  fs.mkdirSync(reviewDir, { recursive: true });
  fs.writeFileSync(path.join(reviewDir, 'en-conflicts.csv'), toCsv(['key', 'chosen_en', 'chosen_from', 'rule', 'resolution', ...APPS.map((a) => a.repo)], conflictRows));
  fs.writeFileSync(path.join(reviewDir, 'translation-divergence.csv'), toCsv(['namespace', 'key', 'lang', 'chosen', 'chosen_from', 'reason', 'candidates'], divergenceRows));
  fs.writeFileSync(path.join(reviewDir, 'missing-translations.csv'), toCsv(['namespace', 'key', 'lang', 'english_fallback'], missingRows));
  fs.writeFileSync(path.join(reviewDir, 'placeholder-mismatches.csv'), toCsv(['namespace', 'key', 'lang', 'english', 'translation'], placeholderRows));
  fs.writeFileSync(path.join(reviewDir, 'key-changes.csv'), toCsv(['app', 'key', 'change', 'detail'], keyChanges));
  fs.writeFileSync(path.join(reviewDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

const parseArgs = (argv) => {
  const args = { legacyRoot: path.resolve(packageDir, '..', '..', '..'), outDir: path.join(packageDir, 'src', 'translations'), reviewDir: path.join(packageDir, 'review'), useGit: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--legacy-root') args.legacyRoot = path.resolve(argv[++i]);
    else if (a === '--out') args.outDir = path.resolve(argv[++i]);
    else if (a === '--review') args.reviewDir = path.resolve(argv[++i]);
    else if (a === '--no-git') args.useGit = false;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  const result = mergeTranslations(args);
  const summary = writeOutputs(result, args);
  console.log(JSON.stringify(summary, null, 2));
}
