// Invariants of the committed translations produced by scripts/merge-legacy-translations.mjs.
import fs from 'node:fs';
import path from 'node:path';

import { SUPPORTED_LANGUAGES } from '../languages';
import { type Namespace, NAMESPACES } from '../namespaces';
import { loadAllNamespaceTranslations } from '../resources/all';
import type { NamespaceTranslations, TranslationTree } from '../resources/types';

const flatten = (tree: TranslationTree, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> => {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
};

const reviewDir = path.resolve(__dirname, '../../review');
const readCsvHeader = (file: string) => fs.readFileSync(path.join(reviewDir, file), 'utf8').split('\n')[0];
const csvRowCount = (file: string) => fs.readFileSync(path.join(reviewDir, file), 'utf8').split('\n').filter(Boolean).length - 1;

describe('merged translations', () => {
  let all: Record<Namespace, NamespaceTranslations>;
  beforeAll(async () => {
    all = await loadAllNamespaceTranslations();
  });

  it('ships every namespace in every supported language', () => {
    for (const ns of NAMESPACES) {
      for (const lang of SUPPORTED_LANGUAGES) expect(all[ns][lang]).toBeDefined();
    }
  });

  it.each(NAMESPACES)('%s: every language has exactly the English keys', (ns) => {
    const enKeys = Object.keys(flatten(all[ns].en)).sort();
    expect(enKeys.length).toBeGreaterThan(0);
    for (const lang of SUPPORTED_LANGUAGES) expect(Object.keys(flatten(all[ns][lang])).sort()).toEqual(enKeys);
  });

  it.each(NAMESPACES)('%s: has no empty or non-string values', (ns) => {
    for (const lang of SUPPORTED_LANGUAGES) {
      for (const [key, value] of Object.entries(flatten(all[ns][lang]))) {
        if (typeof value !== 'string' || value.trim() === '') throw new Error(`${ns}/${lang}: "${key}" is empty`);
      }
    }
  });

  // The variant namespace is read before `common`: an object there at a key that is a string in `common` makes
  // `t(key)` return "key '…' returned an object instead of string" in that app (Responder's `personnel.status`).
  it.each(NAMESPACES.filter((ns) => ns !== 'common'))('%s: never shadows a common string with an object', (ns) => {
    const groupKeys = (tree: TranslationTree, prefix = '', out: string[] = []): string[] => {
      for (const [k, v] of Object.entries(tree)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object') {
          out.push(key);
          groupKeys(v, key, out);
        }
      }
      return out;
    };
    for (const lang of SUPPORTED_LANGUAGES) {
      const commonStrings = flatten(all.common[lang]);
      expect(groupKeys(all[ns][lang]).filter((key) => typeof commonStrings[key] === 'string')).toEqual([]);
    }
  });

  // A copy of a common string in a variant namespace hides every later fix to the shared string in that one app (a fix
  // to Responder's copy of certifications or check-in reached no other app, and the others' fixes never reached it). The
  // keys a variant shares with `common` are only its listed, deliberate wording overrides (review/variant-overrides.json).
  describe('variant overrides of common strings', () => {
    const VARIANTS = NAMESPACES.filter((ns) => ns !== 'common');
    const listed = JSON.parse(fs.readFileSync(path.join(reviewDir, 'variant-overrides.json'), 'utf8')) as Record<string, Record<string, string>>;
    const PLURAL = /_(zero|one|two|few|many|other)$/;
    // `appName` is filled for every string (initI18n's default variables); a plural form may leave out its `count`.
    const placeholders = (key: string, value: unknown) =>
      [...new Set([...String(value).matchAll(/\{\{\s*([\w.]+)/g)].map((m) => m[1]))].filter((name) => name !== 'appName' && !(PLURAL.test(key) && name === 'count')).sort();

    it.each(VARIANTS)('%s: shares keys with common only as listed overrides', (ns) => {
      const common = flatten(all.common.en);
      const shared = Object.keys(flatten(all[ns].en)).filter((key) => typeof common[key] === 'string');
      expect(shared.sort()).toEqual(Object.keys(listed[ns] ?? {}).sort());
    });

    it.each(VARIANTS)('%s: every override differs from common in some language', (ns) => {
      const copies = Object.keys(listed[ns] ?? {}).filter((key) => SUPPORTED_LANGUAGES.every((lang) => flatten(all[ns][lang])[key] === flatten(all.common[lang])[key]));
      expect(copies).toEqual([]);
    });

    it.each(VARIANTS)('%s: overrides take the same {{placeholders}} as the shared string', (ns) => {
      const common = flatten(all.common.en);
      const own = flatten(all[ns].en);
      const mismatched = Object.keys(listed[ns] ?? {}).filter((key) => placeholders(key, own[key]).join() !== placeholders(key, common[key]).join());
      expect(mismatched).toEqual([]);
    });
  });

  it('has no scaffold leftovers', () => {
    for (const ns of NAMESPACES) {
      for (const lang of SUPPORTED_LANGUAGES) expect(JSON.stringify(all[ns][lang])).not.toMatch(/obytes/i);
    }
  });

  it('merged the duplicate namespaces (weatherAlerts, videoFeeds, poi)', () => {
    for (const ns of NAMESPACES) {
      const top = Object.keys(all[ns].en);
      expect(top).not.toContain('weatherAlerts');
      expect(top).not.toContain('videoFeeds');
      expect(top).not.toContain('poi');
    }
    expect(all.common.en.weather_alerts).toBeDefined();
  });

  it('interpolates product names instead of hard-coding them', () => {
    expect(all.common.en.app).toEqual(expect.objectContaining({ title: '{{appName}}' }));
    for (const lang of SUPPORTED_LANGUAGES) expect((all.common[lang].app as TranslationTree).title).toBe('{{appName}}');
    const ownNames: Record<string, string> = { responder: 'Resgrid Responder', unit: 'Resgrid Unit', ic: 'Resgrid IC', dispatch: 'Resgrid Dispatch', bigboard: 'Resgrid BigBoard' };
    for (const [ns, name] of Object.entries(ownNames)) expect(JSON.stringify(all[ns as keyof typeof all].en)).not.toContain(name);
  });

  it('keeps the common namespace for strings shared by several apps', () => {
    const commonKeys = Object.keys(flatten(all.common.en)).length;
    const total = NAMESPACES.reduce((sum, ns) => sum + Object.keys(flatten(all[ns].en)).length, 0);
    expect(commonKeys).toBeGreaterThan(1200);
    expect(commonKeys / total).toBeGreaterThan(0.3);
  });

  it('wrote the review CSVs', () => {
    expect(readCsvHeader('en-conflicts.csv')).toBe('key,chosen_en,chosen_from,rule,resolution,Responder,Unit,IC,Dispatch,BigBoard');
    expect(csvRowCount('en-conflicts.csv')).toBeGreaterThan(0);
    expect(readCsvHeader('translation-divergence.csv')).toBe('namespace,key,lang,chosen,chosen_from,reason,candidates');
    expect(readCsvHeader('missing-translations.csv')).toBe('namespace,key,lang,english_fallback');
    expect(readCsvHeader('placeholder-mismatches.csv')).toBe('namespace,key,lang,english,translation');
    expect(readCsvHeader('key-changes.csv')).toBe('app,key,change,detail');
    const summary = JSON.parse(fs.readFileSync(path.join(reviewDir, 'summary.json'), 'utf8'));
    for (const ns of NAMESPACES) expect(summary.namespaces[ns]).toBe(Object.keys(flatten(all[ns].en)).length);
  });
});
