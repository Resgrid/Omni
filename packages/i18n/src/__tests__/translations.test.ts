// Invariants of the committed translations produced by scripts/merge-legacy-translations.mjs.
import fs from 'node:fs';
import path from 'node:path';

import { SUPPORTED_LANGUAGES } from '../languages';
import { NAMESPACES } from '../namespaces';
import { allNamespaceResources } from '../resources/all';
import type { TranslationTree } from '../resources/types';

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
  it('ships every namespace in every supported language', () => {
    for (const ns of NAMESPACES) {
      for (const lang of SUPPORTED_LANGUAGES) expect(allNamespaceResources[ns][lang]).toBeDefined();
    }
  });

  it.each(NAMESPACES)('%s: every language has exactly the English keys', (ns) => {
    const enKeys = Object.keys(flatten(allNamespaceResources[ns].en)).sort();
    expect(enKeys.length).toBeGreaterThan(0);
    for (const lang of SUPPORTED_LANGUAGES) expect(Object.keys(flatten(allNamespaceResources[ns][lang])).sort()).toEqual(enKeys);
  });

  it.each(NAMESPACES)('%s: has no empty or non-string values', (ns) => {
    for (const lang of SUPPORTED_LANGUAGES) {
      for (const [key, value] of Object.entries(flatten(allNamespaceResources[ns][lang]))) {
        if (typeof value !== 'string' || value.trim() === '') throw new Error(`${ns}/${lang}: "${key}" is empty`);
      }
    }
  });

  it('has no scaffold leftovers', () => {
    for (const ns of NAMESPACES) {
      for (const lang of SUPPORTED_LANGUAGES) expect(JSON.stringify(allNamespaceResources[ns][lang])).not.toMatch(/obytes/i);
    }
  });

  it('merged the duplicate namespaces (weatherAlerts, videoFeeds, poi)', () => {
    for (const ns of NAMESPACES) {
      const top = Object.keys(allNamespaceResources[ns].en);
      expect(top).not.toContain('weatherAlerts');
      expect(top).not.toContain('videoFeeds');
      expect(top).not.toContain('poi');
    }
    expect(allNamespaceResources.common.en.weather_alerts).toBeDefined();
  });

  it('interpolates product names instead of hard-coding them', () => {
    expect(allNamespaceResources.common.en.app).toEqual(expect.objectContaining({ title: '{{appName}}' }));
    for (const lang of SUPPORTED_LANGUAGES) expect((allNamespaceResources.common[lang].app as TranslationTree).title).toBe('{{appName}}');
    const ownNames: Record<string, string> = { responder: 'Resgrid Responder', unit: 'Resgrid Unit', ic: 'Resgrid IC', dispatch: 'Resgrid Dispatch', bigboard: 'Resgrid BigBoard' };
    for (const [ns, name] of Object.entries(ownNames)) expect(JSON.stringify(allNamespaceResources[ns as keyof typeof allNamespaceResources].en)).not.toContain(name);
  });

  it('keeps the common namespace for strings shared by several apps', () => {
    const commonKeys = Object.keys(flatten(allNamespaceResources.common.en)).length;
    const total = NAMESPACES.reduce((sum, ns) => sum + Object.keys(flatten(allNamespaceResources[ns].en)).length, 0);
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
    for (const ns of NAMESPACES) expect(summary.namespaces[ns]).toBe(Object.keys(flatten(allNamespaceResources[ns].en)).length);
  });
});
