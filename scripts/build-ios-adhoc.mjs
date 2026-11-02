#!/usr/bin/env node
// Ad-hoc iOS build for registered test devices, made on a Mac: CI builds only the App Store IPA (omni-plan §6.6.4).
// Builds the `<v>-internal` profile (ad-hoc distribution, channel `internal`) with `eas build --local`. Signing comes
// from the variant's EAS project like every CI build; eas-cli asks to sign in to Apple when the ad-hoc provisioning
// profile has to be regenerated (for example after `eas device:create` registered a new device).
//
// Usage: pnpm ios:adhoc <variant> [--env <path>] [extra eas build arguments, e.g. --clear-cache]
//   The build env uses the GitHub Environment secret names (BASE_API_URL, LOGGING_KEY, APP_KEY, SENTRY_DSN,
//   COUNTLY_APP_KEY, COUNTLY_SERVER_URL, IOS_APPLE_TEAM_ID, IOS_GOOGLE_SERVICES_FILE, RELEASE_RUN_NUMBER). Values come
//   from the shell, then from the env file (default `.env.<variant>` at the repo root, gitignored). Without
//   RELEASE_RUN_NUMBER the version is <major>.0.
//   Output: dist/ios-adhoc/<Prefix>-<version>-ios-adhoc.ipa (gitignored)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const require = createRequire(import.meta.url);
const { VARIANT_IDS, CLIENT_ENV_DEFAULTS, buildClientEnv, computeVariantVersion, loadVariant, runNumberFromEnv } = require('@resgrid/config-plugins');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_ENV = 'internal';
// Client values CI fills from the variant's GitHub Environment; anything left on its default is reported.
const CI_CLIENT_KEYS = ['BASE_API_URL', 'LOGGING_KEY', 'APP_KEY', 'SENTRY_DSN', 'COUNTLY_APP_KEY', 'COUNTLY_SERVER_URL'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

let variant;
let envFile;
const easArgs = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--') continue;
  if (arg === '--env') envFile = argv[++i];
  else if (!variant && !arg.startsWith('-')) variant = arg;
  else easArgs.push(arg);
}

if (!VARIANT_IDS.includes(variant)) fail(`usage: pnpm ios:adhoc <${VARIANT_IDS.join('|')}> [--env <path>] [eas build arguments]`);
if (process.platform !== 'darwin') fail('iOS builds need a Mac with Xcode.');

const file = path.resolve(root, envFile ?? `.env.${variant}`);
let fromFile = {};
if (fs.existsSync(file)) {
  fromFile = parseEnv(fs.readFileSync(file, 'utf8'));
  console.log(`Build env: ${path.relative(root, file)} (values set in the shell win)`);
} else if (envFile) {
  fail(`${envFile} does not exist.`);
}
// APP_VARIANT / APP_ENV select the EAS project and the app config when eas-cli reads app.config.ts.
const env = { ...fromFile, ...process.env, APP_VARIANT: variant, APP_ENV, EXPO_NO_DOTENV: '1' };
if (env.IOS_GOOGLE_SERVICES_FILE) {
  env.IOS_GOOGLE_SERVICES_FILE = path.resolve(root, env.IOS_GOOGLE_SERVICES_FILE);
  if (!fs.existsSync(env.IOS_GOOGLE_SERVICES_FILE)) fail(`IOS_GOOGLE_SERVICES_FILE does not exist: ${env.IOS_GOOGLE_SERVICES_FILE}`);
}

const manifest = loadVariant(variant);
const clientEnv = buildClientEnv(manifest, APP_ENV, env);
const defaulted = CI_CLIENT_KEYS.filter((key) => clientEnv[key] === CLIENT_ENV_DEFAULTS[key]);
if (!env.IOS_APPLE_TEAM_ID) defaulted.push('IOS_APPLE_TEAM_ID');
if (defaulted.length) {
  const api = defaulted.includes('BASE_API_URL') ? ` The app will talk to ${CLIENT_ENV_DEFAULTS.BASE_API_URL}.` : '';
  console.warn(`Left on the defaults: ${defaulted.join(', ')}.${api}`);
}

const { version } = computeVariantVersion(manifest, runNumberFromEnv(env));
const output = path.join(root, 'dist', 'ios-adhoc', `${manifest.identity.name.replace(/\s+/g, '')}-${version}-ios-adhoc.ipa`);
fs.mkdirSync(path.dirname(output), { recursive: true });

// The same eas-cli as CI.
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
const easVersion = /EAS_CLI_VERSION: '([^']+)'/.exec(workflow)?.[1];
if (!easVersion) fail('EAS_CLI_VERSION not found in .github/workflows/release.yml.');

const profile = `${variant}-${APP_ENV}`;
console.log(`eas-cli ${easVersion}: build --local --platform ios --profile ${profile} → ${path.relative(root, output)}`);
const result = spawnSync('npx', ['--yes', `eas-cli@${easVersion}`, 'build', '--local', '--platform', 'ios', '--profile', profile, '--output', output, ...easArgs], {
  cwd: path.join(root, 'apps', 'omni'),
  env,
  stdio: 'inherit',
});
if (result.error) fail(result.error.message);
process.exit(result.status ?? 1);
