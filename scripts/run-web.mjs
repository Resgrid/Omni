#!/usr/bin/env node
// Starts the web dev server for one app: `pnpm web:<variant>`, at http://localhost:8081. When that port is taken (for
// example by another app's web dev server), Expo offers the next free one, so several apps can run side by side. Each
// app keeps its own Metro cache (apps/omni/metro.config.js), so switching apps needs no --clear.
//
// Usage: pnpm web:<variant> [expo start arguments, e.g. --port 8082, --clear, --https]
//   APP_ENV (default development), BASE_API_URL and the other client values come from the shell, as with every
//   development build.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { VARIANT_IDS, resolveBuildTarget } = require('@resgrid/config-plugins');

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'omni');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [variant, ...startArgs] = process.argv.slice(2).filter((arg) => arg !== '--');

if (!VARIANT_IDS.includes(variant)) fail(`usage: node scripts/run-web.mjs <${VARIANT_IDS.join('|')}> [expo start arguments]`);

const env = { ...process.env, APP_VARIANT: variant, EXPO_NO_DOTENV: '1' };

try {
  env.APP_ENV = resolveBuildTarget(env).appEnv;
} catch (error) {
  fail(error.message);
}

console.log(`Starting ${variant} (${env.APP_ENV}) on web.`);

const expoCli = require.resolve('expo/bin/cli', { paths: [projectRoot] });
const result = spawnSync(process.execPath, [expoCli, 'start', '--web', ...startArgs], { cwd: projectRoot, env, stdio: 'inherit' });

if (result.error) fail(`expo start could not start: ${result.error.message}`);

process.exit(result.status ?? 1);
