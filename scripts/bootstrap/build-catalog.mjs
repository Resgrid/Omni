#!/usr/bin/env node
// One-off bootstrap helper (Phase 0): builds the pnpm catalog from the legacy Unit app's exact pins
// (the most tightly pinned of the five), applies the plan's removals/additions, and prints YAML.
// Usage: node scripts/bootstrap/build-catalog.mjs <path-to-legacy-Unit-package.json>
import fs from 'node:fs';

const unitPath = process.argv[2];
if (!unitPath) throw new Error('usage: build-catalog.mjs <Unit/package.json>');
const unit = JSON.parse(fs.readFileSync(unitPath, 'utf8'));

// omni-plan §7 / D7 / D10 / D17: removed from the stack.
const removed = new Set([
  '@dev-plugins/react-query',
  '@tanstack/react-query',
  'react-query-kit',
  '@rnmapbox/maps',
  'mapbox-gl',
  '@types/mapbox-gl',
  '@gorhom/bottom-sheet',
  'react-native-flash-message',
  '@semantic-release/git',
  'np',
  'electron-squirrel-startup',
  'patch-package',
  'postinstall-postinstall',
  'eslint-plugin-react-compiler',
  'promise',
]);

// Extra libraries carried from the other apps or required by the plan.
const added = {
  'expo-calendar': '~57.0.6',
  'react-native-calendars': '^1.1313.0',
  'react-native-permissions': '^5.4.1',
  'expo-sqlite': '~57.0.0',
  'expo-updates': '~57.0.0',
  dompurify: '^3.3.1',
  'jwt-decode': '^4.0.0',
  'react-native-mmkv': '3.3.3',
  'tailwind-variants': '^3.1.0',
  'tailwind-merge': '^3.3.1',
  electron: '40.0.0',
  'electron-builder': '26.4.0',
  'electron-updater': '^6.6.2',
  tsx: '^4.20.6',
  'dependency-cruiser': '^17.0.2',
  lefthook: '^1.13.6',
  '@types/node': '^22.18.0',
  '@types/dompurify': '^3.2.0',
};

const catalog = { ...unit.dependencies, ...unit.devDependencies };
for (const k of removed) delete catalog[k];
Object.assign(catalog, added);

const keys = Object.keys(catalog).sort();
const quote = (s) => (/^[\w@./-]+$/.test(s) && !s.startsWith('@') ? s : `'${s}'`);
const lines = ['catalog:'];
for (const k of keys) lines.push(`  ${quote(k)}: '${catalog[k]}'`);
process.stdout.write(lines.join('\n') + '\n');
