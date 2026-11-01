// Adds new keys to a namespace in all ten languages, keeping key parity (resgrid-i18n skill).
// English gets the given text; other languages get the English text as a placeholder and are listed in
// review/missing-translations.csv for native-speaker translation. Existing keys are never overwritten.
//
// Usage (repo root): npx tsx packages/i18n/scripts/add-keys.ts [namespace]
// The default source collects the keys introduced by the platform packages (location, notifications,
// data errors, ui common components). Key/default tables are read from source text because importing
// those packages would pull in React Native.
import fs from 'node:fs';
import path from 'node:path';

const LANGUAGES = ['en', 'ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'sv', 'uk'] as const;
// `--features` merges every packages/features/src/<domain>/i18n.en.json (and app-shell's) into the namespace.
const withFeatures = process.argv.includes('--features');
const namespace = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'common';
const packagesDir = path.resolve(__dirname, '..', '..');
const translationsDir = path.resolve(__dirname, '..', 'src', 'translations', namespace);
const reviewFile = path.resolve(__dirname, '..', 'review', 'missing-translations.csv');

const LOCATION_ENTRY = /'(location\.[a-z_]+)':\s*'((?:[^'\\]|\\.)*)'/g;
const CHANNEL_MAP_ENTRY = /key:\s*'([a-z_]+)',\s*name:\s*'([^']+)'/g;
const CHANNEL_SPEC_CALL = /spec\('[^']+',\s*'([a-z_]+)',\s*'([^']+)'/g;

function locationKeys(): Record<string, string> {
  const text = fs.readFileSync(path.join(packagesDir, 'location', 'src', 'i18n-keys.ts'), 'utf8');
  const out: Record<string, string> = {};
  for (const m of text.matchAll(LOCATION_ENTRY)) out[m[1]] = m[2].replace(/\\'/g, "'");
  return out;
}

function channelKeys(): Record<string, string> {
  const text = fs.readFileSync(path.join(packagesDir, 'notifications', 'src', 'channels.ts'), 'utf8');
  const out: Record<string, string> = {};
  for (const pattern of [CHANNEL_MAP_ENTRY, CHANNEL_SPEC_CALL]) {
    for (const m of text.matchAll(pattern)) out[`push_notifications.channels.${m[1]}`] = m[2];
  }
  return out;
}

function platformKeys(): Record<string, string> {
  const keys: Record<string, string> = { ...locationKeys(), ...channelKeys() };
  const dataErrors: Record<string, string> = {
    network: 'No network connection. Your change is saved and will be sent when you are back online.',
    timeout: 'The server took too long to respond. Please try again.',
    canceled: 'The request was cancelled.',
    no_session: 'You are signed out. Sign in and try again.',
    unauthorized: 'Your session has expired. Sign in again.',
    forbidden: 'You do not have permission to do that.',
    not_found: 'That item could not be found. It may have been removed.',
    conflict: 'This item was changed by someone else. Refresh and try again.',
    rejected: 'The server rejected this change. Review it and try again.',
    server: 'The server had a problem. Please try again shortly.',
    not_configured: 'The app is still starting. Please try again in a moment.',
    unknown: 'Something went wrong. Please try again.',
  };
  for (const [code, text] of Object.entries(dataErrors)) keys[`errors.data.${code}`] = text;
  Object.assign(keys, {
    'common.loading': 'Loading…',
    'common.error': 'Error',
    'common.something_went_wrong': 'Something went wrong',
    'common.dismiss': 'Dismiss',
    'common.close': 'Close',
    'common.close_menu': 'Close menu',
    'common.back': 'Back',
    'common.no_data_found': 'No data found',
    'common.errorOccurred': 'An error occurred',
    'common.noDataAvailable': 'No data available',
    'common.tryAgainLater': 'Please try again later',
    'common.nothingToDisplay': 'Nothing to display',
    'common.html_content': 'Content',
    'common.previous': 'Previous',
    'common.next': 'Next',
    'common.cancel': 'Cancel',
    'common.done': 'Done',
    'dateTimePicker.hour': 'Hour',
    'dateTimePicker.minute': 'Minute',
    'dateTimePicker.clear': 'Clear',
    'app.realtime_offline_title': 'Live updates paused',
    'app.realtime_offline_description': 'Reconnecting to live updates. Information may be out of date.',
    'settings.view_sync_queue': 'View pending changes',
  });
  return keys;
}

type Json = { [key: string]: Json | string };

function setIfMissing(obj: Json, dottedKey: string, value: string): boolean {
  const parts = dottedKey.split('.');
  let node: Json = obj;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    if (typeof next === 'string') return false; // a string already occupies this path; leave it
    if (next === undefined) node[part] = {};
    node = node[part] as Json;
  }
  const leaf = parts[parts.length - 1];
  if (node[leaf] !== undefined) return false;
  node[leaf] = value;
  return true;
}

function featureKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  const sources = [path.join(packagesDir, 'app-shell', 'src', 'i18n.en.json'), path.join(packagesDir, 'maps', 'src', 'i18n.en.json')];
  const featuresDir = path.join(packagesDir, 'features', 'src');
  if (fs.existsSync(featuresDir)) {
    for (const d of fs.readdirSync(featuresDir, { withFileTypes: true })) if (d.isDirectory()) sources.push(path.join(featuresDir, d.name, 'i18n.en.json'));
  }
  for (const file of sources.filter((f) => fs.existsSync(f))) Object.assign(out, JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>);
  return out;
}

const keys = { ...platformKeys(), ...(withFeatures ? featureKeys() : {}) };
const added: string[] = [];
for (const lang of LANGUAGES) {
  const file = path.join(translationsDir, `${lang}.json`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8')) as Json;
  for (const [key, english] of Object.entries(keys)) {
    if (setIfMissing(json, key, english) && lang === 'en') added.push(key);
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}

if (added.length) {
  const csvValue = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = added.flatMap((key) => LANGUAGES.filter((l) => l !== 'en').map((lang) => [namespace, key, lang, csvValue(keys[key])].join(',')));
  const header = fs.existsSync(reviewFile) ? '' : 'namespace,key,lang,english_fallback\n';
  fs.appendFileSync(reviewFile, header + rows.join('\n') + '\n');
}
// Keep review/summary.json key counts in step with the files (asserted by translations.test.ts).
const summaryFile = path.resolve(__dirname, '..', 'review', 'summary.json');
if (fs.existsSync(summaryFile)) {
  const countLeaves = (obj: Json): number => Object.values(obj).reduce<number>((n, v) => n + (typeof v === 'string' ? 1 : countLeaves(v)), 0);
  const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8')) as { namespaces?: Record<string, number> };
  const en = JSON.parse(fs.readFileSync(path.join(translationsDir, 'en.json'), 'utf8')) as Json;
  summary.namespaces = { ...(summary.namespaces ?? {}), [namespace]: countLeaves(en) };
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');
}
console.log(`Added ${added.length} keys to "${namespace}" in ${LANGUAGES.length} languages.`);
