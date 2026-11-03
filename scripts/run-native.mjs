#!/usr/bin/env node
// Builds one app and runs it on an iOS simulator/device or an Android emulator/device: `pnpm ios:<variant>`,
// `pnpm android:<variant>`. The five apps share one generated native project per platform (apps/omni/ios,
// apps/omni/android) and `expo run` only prebuilds when that folder is missing, so this prebuilds it again (clean)
// whenever it was made for another app, APP_ENV, app config or native inputs. It also stops when the Metro port is
// already serving another app or other client settings: `expo run` reuses a running dev server of this project,
// whichever app and environment it was started with.
//
// Usage: pnpm ios:<variant> | pnpm android:<variant> [--clean] [expo run:<platform> arguments, e.g. --device]
//   --clean prebuilds the native project again even when it matches. APP_ENV (default development), BASE_API_URL and
//   the other client values come from the shell, as with every development build.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRuntimeVersion } from './ci/lib.mjs';

const require = createRequire(import.meta.url);
const { VARIANT_IDS, createAppConfig, resolveBuildTarget, runNumberFromEnv } = require('@resgrid/config-plugins');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.join(root, 'apps', 'omni');
const PLATFORMS = ['ios', 'android'];
const DEFAULT_PORT = 8081;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [platform, variant, ...rest] = process.argv.slice(2).filter((arg) => arg !== '--');
if (!PLATFORMS.includes(platform) || !VARIANT_IDS.includes(variant)) {
  fail(`usage: node scripts/run-native.mjs <${PLATFORMS.join('|')}> <${VARIANT_IDS.join('|')}> [--clean] [expo run:<platform> arguments]`);
}
if (platform === 'ios' && process.platform !== 'darwin') fail('iOS builds need a Mac with Xcode.');

const clean = rest.includes('--clean');
const runArgs = rest.filter((arg) => arg !== '--clean');

const env = { ...process.env, APP_VARIANT: variant, EXPO_NO_DOTENV: '1' };
try {
  env.APP_ENV = resolveBuildTarget(env).appEnv;
} catch (error) {
  fail(error.message);
}
const { APP_ENV: appEnv } = env;
const target = `${variant} (${appEnv})`;

const expoCli = require.resolve('expo/bin/cli', { paths: [projectRoot] });
function expo(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [expoCli, ...args], { cwd: projectRoot, env: { ...env, ...extraEnv }, stdio: 'inherit' });
  if (result.error) fail(`expo ${args[0]} could not start: ${result.error.message}`);
  return result.status ?? 1;
}

const config = createAppConfig({ variant, appEnv, runNumber: runNumberFromEnv(env), projectRoot, env });

// 1. A dev server already on the port would serve its own app's bundle and client settings (`extra.env`, read by the
// app at runtime) to this build.
function portFrom(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') return Number(args[i + 1]);
    if (args[i].startsWith('--port=')) return Number(args[i].slice('--port='.length));
  }
  return DEFAULT_PORT;
}

async function appOnPort(port) {
  try {
    const response = await fetch(`http://localhost:${port}/`, {
      headers: { 'expo-platform': platform, accept: 'application/expo+json,application/json' },
      signal: AbortSignal.timeout(5000),
    });
    const extra = (await response.json())?.extra?.expoClient?.extra;
    return extra?.variant ? { variant: extra.variant, appEnv: extra.appEnv, env: extra.env } : null;
  } catch {
    // Nothing listening, or not an Expo dev server: expo run handles the port itself.
    return null;
  }
}

/** Names (never values: some are keys) of the client settings that differ between two `extra.env` objects. */
function changedSettings(served, wanted) {
  const names = new Set([...Object.keys(served ?? {}), ...Object.keys(wanted ?? {})]);
  return [...names].filter((name) => served?.[name] !== wanted?.[name]).sort();
}

// --no-bundler builds and installs only: expo run then neither starts nor reuses a dev server, so there is none to check.
const port = portFrom(runArgs);
const running = runArgs.includes('--no-bundler') ? null : await appOnPort(port);
const otherPort = `pnpm ${platform}:${variant} --port ${port + 1}`;
if (running && (running.variant !== variant || running.appEnv !== appEnv)) {
  fail(`Metro on port ${port} is serving ${running.variant} (${running.appEnv}), and expo run would reuse it for ${target}.\n` + `Stop that dev server, or use another port: ${otherPort}`);
}
const changed = running ? changedSettings(running.env, config.extra.env) : [];
if (changed.length) {
  fail(
    `Metro on port ${port} is serving ${target} with other client settings (${changed.join(', ')}), and expo run would reuse it.\n` +
      `Stop that dev server so this run starts one with the settings from this shell, or use another port: ${otherPort}`
  );
}

// 2. Prebuild when the native project was made for something else. The record holds the app config hash without
// `extra` (client env, read when the app is built, not prebuilt) and without the other platforms' sections, and the
// Expo fingerprint of the native inputs (the release runtime version: config plugin code, icons and splash images,
// native modules, patches), which changes when a file the config names changes but its path does not. It lives inside
// the native folder, so `expo prebuild --clean` from anywhere removes it.
const nativeDir = path.join(projectRoot, platform);
const recordFile = path.join(nativeDir, '.omni-prebuild.json');
const otherPlatforms = Object.fromEntries(['ios', 'android', 'web'].filter((p) => p !== platform).map((p) => [p, undefined]));
const configHash = crypto
  .createHash('sha256')
  .update(JSON.stringify({ ...config, ...otherPlatforms, extra: undefined }))
  .digest('hex');
let fingerprint;
try {
  // The managed workflow leaves the generated native folder out, so the value is the same before and after prebuild.
  fingerprint = resolveRuntimeVersion(variant, appEnv, platform, env).runtimeVersion;
} catch (error) {
  fail(`Could not fingerprint the native inputs of ${target}: ${error.message}`);
}

let record = null;
try {
  record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
} catch {
  // Not prebuilt by this script.
}

const nativePath = path.relative(root, nativeDir);
let reason = null;
if (!fs.existsSync(nativeDir)) reason = `${nativePath} does not exist yet`;
else if (clean) reason = '--clean';
else if (!record) reason = `${nativePath} was not prebuilt by this script`;
else if (record.variant !== variant || record.appEnv !== appEnv) reason = `${nativePath} is ${record.variant} (${record.appEnv})`;
else if (record.configHash !== configHash) reason = `the app config changed since ${nativePath} was prebuilt`;
else if (record.fingerprint !== fingerprint) reason = `the native inputs (config plugins, icons, native modules) changed since ${nativePath} was prebuilt`;

if (reason) {
  console.log(`Prebuilding ${target} for ${platform}: ${reason}.`);
  // The native folders are generated and gitignored (CNG), so the dirty-git-tree prompt guards nothing here.
  const status = expo(['prebuild', '--clean', '--platform', platform], { EXPO_NO_GIT_STATUS: '1' });
  if (status !== 0) process.exit(status);
  fs.writeFileSync(recordFile, `${JSON.stringify({ variant, appEnv, configHash, fingerprint }, null, 2)}\n`);
}

// 3. Build, install and launch; Metro starts in this terminal unless one for the same app is already running.
console.log(`Running ${target} on ${platform}.`);
process.exit(expo([`run:${platform}`, ...runArgs]));
