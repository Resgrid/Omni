#!/usr/bin/env node
// One-off bootstrap (Phase 0): writes apps/omni/package.json with every runtime dependency the five
// apps use, each pinned through the workspace catalog. After bootstrap, edit package.json directly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const unit = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const removed = new Set([
  '@dev-plugins/react-query',
  '@tanstack/react-query',
  'react-query-kit',
  '@rnmapbox/maps',
  'mapbox-gl',
  '@gorhom/bottom-sheet',
  'react-native-flash-message',
  '@semantic-release/git',
  'promise',
  'babel-plugin-module-resolver',
  'babel-plugin-transform-import-meta',
  '@eneris/push-receiver',
]);
const runtimeAdded = ['expo-calendar', 'react-native-calendars', 'react-native-permissions', 'expo-sqlite', 'expo-updates', 'dompurify', 'jwt-decode', 'tailwind-merge'];

const deps = {};
for (const k of Object.keys(unit.dependencies)) if (!removed.has(k)) deps[k] = 'catalog:';
for (const k of runtimeAdded) deps[k] = 'catalog:';

const devDeps = {};
for (const k of [
  '@expo/config',
  '@react-native/jest-preset',
  '@tailwindcss/postcss',
  '@testing-library/jest-dom',
  '@testing-library/react-native',
  '@types/geojson',
  '@types/lodash.memoize',
  '@types/react',
  '@types/react-native-base64',
  '@types/sanitize-html',
  '@types/dompurify',
  'babel-jest',
  'jest-expo',
  'jest-environment-jsdom',
  'react-native-svg-transformer',
  'tailwindcss',
  'babel-plugin-module-resolver',
  'babel-plugin-transform-import-meta',
  'cross-env',
])
  devDeps[k] = 'catalog:';

const workspacePackages = ['config', 'config-plugins', 'core', 'models', 'api', 'offline', 'auth', 'data', 'realtime', 'notifications', 'location', 'voice', 'maps', 'navigation', 'i18n', 'ui', 'app-shell', 'features'];
for (const p of workspacePackages) deps[`@resgrid/${p}`] = 'workspace:*';

const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

const pkg = {
  name: '@resgrid/omni',
  version: '0.0.0',
  private: true,
  main: 'index.ts',
  scripts: {
    start: 'cross-env EXPO_NO_DOTENV=1 expo start',
    android: 'cross-env EXPO_NO_DOTENV=1 expo run:android',
    ios: 'cross-env EXPO_NO_DOTENV=1 expo run:ios',
    web: 'cross-env EXPO_NO_DOTENV=1 expo start --web',
    prebuild: 'cross-env EXPO_NO_DOTENV=1 expo prebuild --clean',
    'web:export': 'cross-env EXPO_NO_DOTENV=1 node ../../scripts/web-export.mjs',
    config: 'cross-env EXPO_NO_DOTENV=1 expo config --type public --json',
    doctor: 'npx expo-doctor@latest',
  },
  dependencies: sorted(deps),
  devDependencies: sorted(devDeps),
  expo: {
    doctor: {
      reactNativeDirectoryCheck: { listUnknownPackages: false, exclude: ['react-native-restart', 'lucide-react-native', 'react-native-callkeep', '@notifee/react-native'] },
    },
    install: { exclude: ['eslint-config-expo', '@sentry/react-native'] },
  },
};

fs.writeFileSync(path.join(root, 'apps', 'omni', 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log(`apps/omni/package.json: ${Object.keys(deps).length} deps, ${Object.keys(devDeps).length} devDeps`);
