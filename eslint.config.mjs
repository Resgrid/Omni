// ESLint flat config for the whole monorepo (omni-plan §6.1). Rules carried from the legacy apps:
// Responder's rule set, Unit's ban on React Native Modal, ternaries instead of && in JSX.
import { createRequire } from 'node:module';

import { fixupPluginRules } from '@eslint/compat';
import { importX } from 'eslint-plugin-import-x';
import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

const require = createRequire(import.meta.url);

// eslint-config-expo 58 is written for ESLint 9; two of its plugins need help on ESLint 10:
// - eslint-plugin-import supports ESLint up to 9. eslint-plugin-import-x implements the same rules under the same names,
//   so it takes the `import` namespace (rule ids and disable comments stay `import/…`), and Expo's `import/*` settings are
//   mirrored to the `import-x/*` keys it reads.
// - eslint-plugin-react 7.37 calls context methods ESLint 10 removed (getFilename, getSourceCode…); @eslint/compat adds
//   them back. One wrapped copy is shared by every config object (flat config rejects two plugins with one name).
const reactPlugins = new Map();
const compatReact = (plugin) => {
  if (!reactPlugins.has(plugin)) reactPlugins.set(plugin, fixupPluginRules(plugin));
  return reactPlugins.get(plugin);
};
const forEslint10 = (config) => {
  const plugins = config.plugins ? { ...config.plugins, ...(config.plugins.import ? { import: importX } : {}), ...(config.plugins.react ? { react: compatReact(config.plugins.react) } : {}) } : undefined;
  const settings = config.settings
    ? {
        ...config.settings,
        ...Object.fromEntries(
          Object.entries(config.settings)
            .filter(([key]) => key.startsWith('import/'))
            .map(([key, value]) => [key.replace(/^import\//, 'import-x/'), value])
        ),
      }
    : undefined;
  return { ...config, ...(plugins ? { plugins } : {}), ...(settings ? { settings } : {}) };
};
const expoConfig = require('eslint-config-expo/flat').map(forEslint10);

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
      'apps/omni/*-env.d.ts',
      // Copied from maplibre-gl by metro.config.js on every Metro start (git-ignored).
      'apps/omni/public/maplibre-gl-worker.js',
      'apps/desktop/out/**',
      // Playwright and Maestro output (traces carry the bundle's JavaScript), written while a suite runs.
      'apps/omni/e2e/{test-results,playwright-report,results,maestro-output,qa-output}/**',
      'apps/desktop/release/**',
      '.claude/**',
      '.agents/**',
      'packages/config-plugins/plugins/live-activities/**',
      // Vendored anti-slop Oxlint plugin: upstream formatting kept so updates diff cleanly (UPSTREAM.md there).
      'tooling/oxlint/anti-slop/**',
    ],
  },
  ...expoConfig,
  {
    plugins: { prettier: prettierPlugin, 'simple-import-sort': simpleImportSort, 'unused-imports': unusedImports },
    // import-x keeps the export map of every module it parses. Parsing packages' typings for the export-map rules (named,
    // default, namespace, no-named-as-default…) and following cycles through node_modules took ESLint past 7 GB; type-check
    // already validates package imports, and a cycle through our code cannot pass through a package. Workspace files
    // are still parsed and checked.
    settings: { 'import-x/resolver': { typescript: { project: './tsconfig.json' } }, 'import-x/ignore': ['node_modules'] },
    rules: {
      'prettier/prettier': 'warn',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'import/no-cycle': ['error', { ignoreExternal: true }],
      // eslint-plugin-react-hooks 7 (eslint-config-expo 58) adds React Compiler rules. The apps do not run the compiler
      // (`experiments.reactCompiler` is an experiment), so these stay off until it is adopted; rules-of-hooks and
      // exhaustive-deps still apply.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
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
    // The web push service worker runs in the browser's service worker scope, not Node.
    files: ['apps/omni/public/service-worker.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    // A standalone package (pnpm install --ignore-workspace), installed only when the artwork is regenerated, so CI lints
    // it without its dependencies. An ignore rather than a disable comment: that would be reported unused once installed.
    files: ['scripts/brand-assets/**'],
    rules: { 'import/no-unresolved': ['error', { ignore: ['^@resvg/resvg-js$'] }] },
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
