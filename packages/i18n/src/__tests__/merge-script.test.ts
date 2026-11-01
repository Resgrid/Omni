// Runs scripts/merge-legacy-translations.mjs against a synthetic set of legacy repos and checks its rules.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const script = path.resolve(__dirname, '../../scripts/merge-legacy-translations.mjs');
const LANGS = ['en', 'ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'sv', 'uk'];

type Tree = { [key: string]: string | Tree };

const fixture: Record<string, Record<string, Tree>> = {
  Responder: {
    en: {
      app: { title: 'Resgrid Responder' },
      shared: { five: 'Five' },
      only: { r: 'Responder only' },
      conflict: { trivial: 'Loading' },
      login: { title: 'Login' },
      weatherAlerts: { title: 'Weather' },
      poi: { name: 'Point' },
      onboarding: { message: 'Welcome to obytes app site' },
      count: { items: '{{count}} items' },
    },
    de: {
      app: { title: 'Resgrid Responder' },
      shared: { five: 'Fünf' },
      only: { r: 'Nur Responder' },
      conflict: { trivial: 'Laden' },
      login: { title: 'Anmelden' },
      weatherAlerts: { title: 'Wetter' },
      poi: { name: 'Punkt' },
      onboarding: { message: 'Willkommen obytes' },
      count: { items: 'Elemente' },
    },
  },
  Unit: {
    en: {
      app: { title: 'Resgrid Unit' },
      shared: { five: 'Five' },
      two: { same: 'Same' },
      conflict: { trivial: 'Loading...' },
      login: { title: 'Sign In' },
      weather_alerts: { title: 'Weather' },
      count: { items: '{{count}} items' },
    },
    de: {
      app: { title: 'Resgrid Unit' },
      shared: { five: 'Fünf' },
      two: { same: 'Gleich' },
      conflict: { trivial: 'Laden...' },
      login: { title: 'Einloggen' },
      weather_alerts: { title: 'Wetter' },
      count: { items: '{{count}} Elemente' },
    },
    ar: { app: { title: 'وحدة ريسغريد' }, shared: { five: 'خمسة' }, two: { same: 'نفس' }, conflict: { trivial: 'تحميل' }, login: { title: 'دخول' }, weather_alerts: { title: 'طقس' }, count: { items: '{{count}} عناصر' } },
  },
  IC: {
    en: { app: { title: 'Resgrid IC' }, shared: { five: 'Five' }, two: { same: 'Same' }, conflict: { trivial: 'Loading...' }, login: { title: 'Sign In' } },
    de: { app: { title: 'Resgrid IC' }, shared: { five: 'Funf alt' }, two: { same: 'Gleich' }, conflict: { trivial: 'Laden...' }, login: { title: 'Einloggen' } },
  },
  Dispatch: {
    en: { app: { title: 'Resgrid Dispatch' }, shared: { five: 'Five' }, conflict: { trivial: 'Loading...' }, login: { title: 'Login' } },
    de: { app: { title: 'Resgrid Dispatch' }, shared: { five: 'Fünf' }, conflict: { trivial: 'Laden...' }, login: { title: 'Anmelden' } },
  },
  BigBoard: {
    en: { app: { title: 'Resgrid BigBoard' }, shared: { five: 'Five' }, login: { title: 'Login' } },
    de: { app: { title: 'Resgrid BigBoard' }, shared: { five: 'Five' }, login: { title: 'Anmelden' } },
  },
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  return rows;
};

describe('merge-legacy-translations.mjs', () => {
  let root: string;
  const out = () => path.join(root, 'out');
  const review = () => path.join(root, 'review');
  const read = (ns: string, lang: string): Tree => JSON.parse(fs.readFileSync(path.join(out(), ns, `${lang}.json`), 'utf8'));
  const csv = (file: string) => parseCsv(fs.readFileSync(path.join(review(), file), 'utf8'));

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-i18n-merge-'));
    for (const [repo, langs] of Object.entries(fixture)) {
      const dir = path.join(root, repo, 'src', 'translations');
      fs.mkdirSync(dir, { recursive: true });
      for (const [lang, tree] of Object.entries(langs)) fs.writeFileSync(path.join(dir, `${lang}.json`), JSON.stringify(tree, null, 2));
    }
    execFileSync(process.execPath, [script, '--legacy-root', root, '--out', out(), '--review', review(), '--no-git'], { stdio: 'pipe' });
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes all six namespaces in all ten languages with identical key sets', () => {
    for (const ns of ['common', 'responder', 'unit', 'ic', 'dispatch', 'bigboard']) {
      const keys = JSON.stringify(Object.keys(read(ns, 'en')).sort());
      for (const lang of LANGS) {
        expect(fs.existsSync(path.join(out(), ns, `${lang}.json`))).toBe(true);
        const flat = (t: Tree, p = ''): string[] => Object.entries(t).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
        expect(flat(read(ns, lang)).sort()).toEqual(flat(read(ns, 'en')).sort());
        expect(JSON.stringify(Object.keys(read(ns, lang)).sort())).toBe(keys);
      }
    }
  });

  it('puts keys shared by 2+ apps in common and single-app keys in the owner namespace', () => {
    const common = read('common', 'en');
    expect(common.shared).toEqual({ five: 'Five' });
    expect(common.two).toEqual({ same: 'Same' });
    expect(common.only).toBeUndefined();
    expect(read('responder', 'en').only).toEqual({ r: 'Responder only' });
  });

  it('merges duplicate namespaces and drops scaffold strings', () => {
    expect(read('common', 'en').weather_alerts).toEqual({ title: 'Weather' });
    expect(read('responder', 'en').pois).toEqual({ name: 'Point' });
    for (const ns of ['common', 'responder']) {
      expect(read(ns, 'en').weatherAlerts).toBeUndefined();
      expect(read(ns, 'en').poi).toBeUndefined();
      expect(JSON.stringify(read(ns, 'de'))).not.toMatch(/obytes/);
    }
  });

  it('replaces each app’s own product name with {{appName}}, even in transliterated titles', () => {
    expect(read('common', 'en').app).toEqual({ title: '{{appName}}' });
    expect(read('common', 'ar').app).toEqual({ title: '{{appName}}' });
  });

  it('resolves English conflicts: family preference to common, real wording differences kept as variant overrides', () => {
    expect((read('common', 'en').login as Tree).title).toBe('Login');
    expect((read('unit', 'en').login as Tree).title).toBe('Sign In');
    expect((read('ic', 'en').login as Tree).title).toBe('Sign In');
    expect((read('unit', 'de').login as Tree).title).toBe('Einloggen');
    expect(read('dispatch', 'en').login).toBeUndefined();
  });

  it('unifies trivial differences (case, trailing punctuation) by majority without overrides', () => {
    expect((read('common', 'en').conflict as Tree).trivial).toBe('Loading...');
    expect(read('responder', 'en').conflict).toBeUndefined();
  });

  it('records every conflict in en-conflicts.csv', () => {
    const rows = csv('en-conflicts.csv');
    const byKey = Object.fromEntries(rows.slice(1).map((r) => [r[0], r]));
    expect(byKey['login.title'].slice(1, 5)).toEqual(['Login', 'RDB', 'family: Responder sign-in/settings wording', 'override kept for UI']);
    expect(byKey['conflict.trivial'].slice(1, 5)).toEqual(['Loading...', 'UID', 'majority', 'unified']);
    expect(byKey['shared.five']).toBeUndefined();
  });

  it('chooses divergent translations: placeholders first, then translated over untranslated, then recency/app order', () => {
    // R lacks {{count}}; U keeps it, so U wins despite app order.
    expect((read('common', 'de').count as Tree).items).toBe('{{count}} Elemente');
    // B left the English text; I has an older wording; R (first in app order, no git times) wins.
    expect((read('common', 'de').shared as Tree).five).toBe('Fünf');
    const rows = csv('translation-divergence.csv').slice(1);
    const reasons = Object.fromEntries(rows.map((r) => [`${r[1]}/${r[2]}`, r[5]]));
    expect(reasons['count.items/de']).toBe('placeholders match English');
    expect(reasons['shared.five/de']).toBe('app order');
  });

  it('fills missing translations from English and lists them', () => {
    expect((read('responder', 'fr').only as Tree).r).toBe('Responder only');
    const rows = csv('missing-translations.csv').slice(1);
    expect(rows).toContainEqual(['responder', 'only.r', 'fr', 'Responder only']);
    expect(rows.some((r) => r[2] === 'en')).toBe(false);
  });

  it('is reproducible', () => {
    const before = fs.readFileSync(path.join(out(), 'common', 'de.json'), 'utf8');
    execFileSync(process.execPath, [script, '--legacy-root', root, '--out', out(), '--review', review(), '--no-git'], { stdio: 'pipe' });
    expect(fs.readFileSync(path.join(out(), 'common', 'de.json'), 'utf8')).toBe(before);
  });
});
