// ESLint flat config for the whole monorepo (omni-plan §6.1). Rules carried from the legacy apps:
// Responder's rule set, Unit's ban on React Native Modal, ternaries instead of && in JSX.
import { createRequire } from 'node:module';

import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

const require = createRequire(import.meta.url);
const expoConfig = require('eslint-config-expo/flat');

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/.metro-cache/**',
      'apps/omni/ios/**',
      'apps/omni/android/**',
      'apps/omni/expo-env.d.ts',
      'apps/omni/*-env.d.ts',
      // Copied from maplibre-gl by metro.config.js on every Metro start (git-ignored).
      'apps/omni/public/maplibre-gl-worker.js',
      'apps/desktop/out/**',
      'apps/desktop/release/**',
      '.claude/**',
      '.agents/**',
      'packages/config-plugins/plugins/live-activities/**',
    ],
  },
  ...expoConfig,
  {
    plugins: { prettier: prettierPlugin, 'simple-import-sort': simpleImportSort, 'unused-imports': unusedImports },
    settings: { 'import/resolver': { typescript: { project: './tsconfig.json' } } },
    rules: {
      'prettier/prettier': 'warn',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'import/no-cycle': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'react-native', importNames: ['Modal'], message: 'Use NativeModal or an overlay primitive from @resgrid/ui (AGENTS.md).' }],
        },
      ],
    },
  },
  {
    // Build-time code runs in Node: config plugins, tooling, scripts, Metro/Babel/Jest configs, Electron main.
    files: ['**/*.js', '**/*.cjs', '**/*.mjs', 'apps/omni/app.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['**/*.tsx', '**/*.jsx'],
    rules: { 'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary'] }] },
  },
  {
    files: ['**/__tests__/**', '**/*.test.*', 'tooling/jest-preset/**'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
  },
  {
    files: ['**/__tests__/**/*.ts', '**/__tests__/**/*.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
];
