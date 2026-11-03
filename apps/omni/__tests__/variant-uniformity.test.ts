import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { VARIANT_IDS } = require('@resgrid/config-plugins');

// The five apps are one codebase (AGENTS.md "How the five apps differ"): a file under variants/<v>/ that several apps have
// is the same file in each, apart from the app's own id, so a change made for one app reaches all of them. Per-app facts
// live in variant.json; per-app navigation in nav.ts; the home route may differ (Dispatch's home is its console).
const VARIANTS_DIR = path.resolve(__dirname, '..', 'variants');
const PER_APP = new Set(['nav.ts', 'app/(app)/index.tsx']);

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

/** The file with the app's id (`unit`, `unitResources`, `resources/unit`) replaced, so the five copies compare equal. */
const normalized = (variant: string, file: string): string => fs.readFileSync(file, 'utf8').replace(new RegExp(`(?<![A-Za-z])${variant}(?=Resources|[^A-Za-z]|$)`, 'g'), '<variant>');

describe('variant folders', () => {
  it('share every file that several apps have, apart from the app id', () => {
    const copies = new Map<string, Map<string, string[]>>();
    for (const variant of VARIANT_IDS as string[]) {
      const root = path.join(VARIANTS_DIR, variant);
      for (const file of walk(root)) {
        const rel = path.relative(root, file).replace(/\\/g, '/');
        if (PER_APP.has(rel)) continue;
        const byText = copies.get(rel) ?? new Map<string, string[]>();
        const text = normalized(variant, file);
        byText.set(text, [...(byText.get(text) ?? []), variant]);
        copies.set(rel, byText);
      }
    }
    const diverged = [...copies].filter(([, byText]) => byText.size > 1).map(([rel, byText]) => `${rel}: ${[...byText.values()].map((apps) => apps.join('+')).join(' vs ')}`);
    expect(diverged).toEqual([]);
  });

  it('give every app the same root layout', () => {
    const layouts = new Set((VARIANT_IDS as string[]).map((variant) => normalized(variant, path.join(VARIANTS_DIR, variant, 'app', '_layout.tsx'))));
    expect(layouts.size).toBe(1);
  });
});
