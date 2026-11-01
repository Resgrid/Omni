#!/usr/bin/env node
// One-off integration helper (Phase 1): declares each workspace package's dependencies from what its
// source actually imports, using `workspace:*` for @resgrid packages and `catalog:` for third-party ones.
// Packages were written without dependency lists so concurrent work could not desync the lockfile.
// Usage: node scripts/bootstrap/declare-package-deps.mjs   (then run `pnpm install`)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogText = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
const catalogSection = catalogText.split(/^catalog:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
const catalog = new Set(
  catalogSection
    .split('\n')
    .map((l) => l.trim().match(/^'?([^':]+(?::[^':]+)?)'?\s*:/)?.[1])
    .filter(Boolean)
);

const builtins = new Set(['fs', 'path', 'os', 'crypto', 'url', 'util', 'events', 'stream', 'child_process', 'module', 'http', 'https', 'zlib', 'assert', 'buffer', 'net', 'tls', 'worker_threads', 'perf_hooks', 'timers']);
const packages = ['core', 'i18n', 'models', 'api', 'offline', 'auth', 'data', 'realtime', 'notifications', 'location', 'voice', 'ui', 'maps', 'app-shell', 'features'];

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
};

const importRe = /(?:from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)|jest\.mock\(\s*['"]([^'"]+)['"])/g;
const pkgName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

for (const name of packages) {
  const dir = path.join(root, 'packages', name);
  const manifestPath = path.join(dir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const runtime = new Set();
  const dev = new Set();
  for (const file of walk(path.join(dir, 'src'))) {
    const isTest = /__tests__|\.test\.|testing[\\/]/.test(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(importRe)) {
      const spec = m[1] || m[2] || m[3] || m[4];
      if (!spec || spec.startsWith('.') || spec.startsWith('node:') || builtins.has(spec)) continue;
      const dep = pkgName(spec);
      if (dep === `@resgrid/${name}`) continue;
      (isTest ? dev : runtime).add(dep);
    }
  }
  for (const d of runtime) dev.delete(d);
  const spec = (d) => (d.startsWith('@resgrid/') ? 'workspace:*' : catalog.has(d) ? 'catalog:' : null);
  const missing = [...runtime, ...dev].filter((d) => !spec(d));
  const toObj = (set) =>
    Object.fromEntries(
      [...set]
        .filter(spec)
        .sort()
        .map((d) => [d, spec(d)])
    );
  manifest.dependencies = toObj(runtime);
  const devObj = toObj(dev);
  if (Object.keys(devObj).length) manifest.devDependencies = devObj;
  else delete manifest.devDependencies;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${name}: ${Object.keys(manifest.dependencies).length} deps, ${Object.keys(devObj).length} devDeps${missing.length ? ` — NOT IN CATALOG: ${missing.join(', ')}` : ''}`);
}
