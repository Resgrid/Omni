#!/usr/bin/env node
// Opens `eas credentials` for one native emit of one or more apps: `pnpm credentials:<emit> <variant>`. Signing
// credentials live only on each app's EAS project (omni-plan §15 #19). The five apps' build profiles share one eas.json,
// and the profile chosen in eas-cli decides which app (EAS project, bundle id, package) the credentials belong to, so
// this names the emit's profile, shows that app's identity and runs the eas-cli CI pins in apps/omni with the profile's
// env.
//
//   android     upload keystore of the Google Play AAB and the sideload APK (both sign with it)
//   ios         distribution certificate and App Store provisioning profiles of the App Store IPA
//   ios-adhoc   distribution certificate and ad hoc provisioning profiles of the ad-hoc IPA (`pnpm ios:adhoc`), and of
//               development builds with --env development
// Responder and Unit also sign the CheckInTimerWidget extension; eas-cli sets it up with the app. Production and
// internal builds share the app's identity; staging and development builds have their own (`<id>.staging`,
// `<id>.development`) and so their own credentials: choose them with --env.
//
// Usage: pnpm credentials:<emit> <variant> [<variant> ...] [--env production|internal|staging|development] [--setup]
//   Without --setup: eas-cli's interactive credentials manager (view, add, replace, remove, download); choose the build
//   profile this prints when eas-cli asks for one.
//   --setup: `eas credentials:configure-build` for exactly that profile: keeps valid credentials and creates what is
//   missing or expired (eas-cli asks to sign in to Apple when it has to).
// Needs an Expo account with access to the app's EAS project (`eas login`, or EXPO_TOKEN).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { easCliVersion } from './ci/lib.mjs';

const require = createRequire(import.meta.url);
const { APP_ENVS, VARIANT_IDS, createAppConfig } = require('@resgrid/config-plugins');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.join(root, 'apps', 'omni');

// Native emit → platform, iOS distribution its profiles must have, and eas.json build type per APP_ENV (profile
// `<variant>-<type>`). The ad-hoc IPA builds as internal, which has the production identity.
const EMITS = {
  android: { platform: 'android', label: 'Google Play AAB and sideload APK', types: { production: 'production', internal: 'internal-store', staging: 'staging-store', development: 'development' } },
  ios: { platform: 'ios', distribution: 'store', label: 'App Store IPA', types: { production: 'production', internal: 'internal-store', staging: 'staging-store' } },
  'ios-adhoc': { platform: 'ios', distribution: 'internal', label: 'ad-hoc IPA', types: { production: 'internal', internal: 'internal', development: 'development' } },
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

const usage = `usage: node scripts/eas-credentials.mjs <${Object.keys(EMITS).join('|')}> <${VARIANT_IDS.join('|')}> [more variants] [--env <${APP_ENVS.join('|')}>] [--setup]`;
const [emitName, ...rest] = process.argv.slice(2).filter((arg) => arg !== '--');
const emit = Object.hasOwn(EMITS, emitName) ? EMITS[emitName] : null;

if (!emit) fail(usage);

let appEnv = 'production';
let setup = false;
const variants = [];

for (let i = 0; i < rest.length; i++) {
  const arg = rest[i];

  if (arg === '--setup') setup = true;
  else if (arg === '--env') appEnv = rest[++i];
  else if (VARIANT_IDS.includes(arg)) variants.push(arg);
  else fail(`Unknown argument "${arg}".\n${usage}`);
}

if (!variants.length) fail(usage);

if (!APP_ENVS.includes(appEnv)) fail(`--env must be one of: ${APP_ENVS.join(', ')}.`);

const type = emit.types[appEnv];

if (!type) {
  const others = Object.keys(EMITS).filter((name) => EMITS[name].platform === emit.platform && EMITS[name].types[appEnv]);

  fail(`No ${appEnv} build makes the ${emit.label}. For ${appEnv} ${emit.platform} credentials: ${others.map((name) => `pnpm credentials:${name} ${variants.join(' ')} --env ${appEnv}`).join(', or ')}`);
}

const easJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'eas.json'), 'utf8'));
let version;

try {
  version = easCliVersion();
} catch (error) {
  fail(error.message);
}

for (const variant of variants) {
  const profile = `${variant}-${type}`;
  const body = easJson.build?.[profile];

  if (!body) fail(`apps/omni/eas.json has no build profile ${profile}. Run pnpm eas:generate, or update EMITS in scripts/eas-credentials.mjs.`);

  const distribution = body.distribution ?? 'store';

  if (emit.distribution && distribution !== emit.distribution) fail(`${profile} is a ${distribution} build, not ${emit.distribution}: update EMITS in scripts/eas-credentials.mjs.`);

  // The profile's env (APP_VARIANT, APP_ENV) is what eas-cli applies once the profile is chosen; set it from the start.
  const env = { ...process.env, ...body.env };
  const config = createAppConfig({ variant, appEnv: body.env.APP_ENV, runNumber: 0, projectRoot, env });
  const extensions = config.extra.eas.build?.experimental?.ios?.appExtensions ?? [];
  const ids = emit.platform === 'ios' ? [`bundle id ${config.ios.bundleIdentifier}`, ...extensions.map((ext) => `${ext.targetName} ${ext.bundleIdentifier}`)] : [`package ${config.android.package}`];

  console.log(`\n${config.name}: ${emit.label} (${body.env.APP_ENV})`);
  console.log(`  EAS project ${config.extra.eas.projectId}, ${ids.join(', ')}`);

  if (emit.platform === 'android') console.log('  If eas-cli offers to generate a keystore for an app already on Google Play, upload its existing upload keystore instead.');

  const args = setup ? ['credentials:configure-build', '--platform', emit.platform, '--profile', profile] : ['credentials', '--platform', emit.platform];

  console.log(`eas-cli ${version}: ${args.join(' ')}`);

  if (!setup) console.log(`When eas-cli asks "Which build profile do you want to configure?", choose ${profile}.\n`);

  const result = spawnSync('npx', ['--yes', `eas-cli@${version}`, ...args], { cwd: projectRoot, env, stdio: 'inherit', shell: process.platform === 'win32' });

  if (result.error) fail(`eas-cli could not start: ${result.error.message}`);

  if (result.status !== 0) process.exit(result.status ?? 1);
}
