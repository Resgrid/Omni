#!/usr/bin/env node
// Resolves `expo config --type public --json` for one variant in each APP_ENV and checks the identity values
// that must never drift (AGENTS.md "Never change without a migration"): name, slug, bundle id / package (with the
// `.<env>` suffix outside production/internal), schemes, EAS project id, update URL, fingerprint runtime policy,
// router root. The resolved configs are written to --out for review as CI artifacts.
//
// Usage: node scripts/ci/expo-config-sanity.mjs --variant unit [--envs production,development] [--out expo-config]
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { csv, loadManifest, omniRoot, parseArgs, requireArg, writeJson } from './lib.mjs';

const args = parseArgs();
const variant = requireArg(args, 'variant');
const envs = csv(args.envs || 'production,internal,development', ['production', 'internal', 'staging', 'development']);
const outDir = args.out ? path.resolve(String(args.out)) : null;
const m = loadManifest(variant);
const problems = [];

const isStore = (env) => env === 'production' || env === 'internal';
const suffixed = (id, env) => (isStore(env) ? id : `${id}.${env}`);

for (const appEnv of envs) {
  const result = spawnSync('npx', ['expo', 'config', '--type', 'public', '--json'], {
    cwd: omniRoot,
    env: { ...process.env, APP_VARIANT: variant, APP_ENV: appEnv, EXPO_NO_DOTENV: '1', RELEASE_RUN_NUMBER: process.env.RELEASE_RUN_NUMBER ?? '0' },
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    problems.push(`${appEnv}: expo config failed (exit ${result.status})\n${result.stderr}`);
    continue;
  }
  let c;
  try {
    c = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  } catch (error) {
    problems.push(`${appEnv}: could not parse expo config output: ${error.message}`);
    continue;
  }
  if (outDir) writeJson(path.join(outDir, `${variant}-${appEnv}.json`), c);

  const expect = (label, actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) problems.push(`${appEnv}: ${label} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  };
  const schemes = m.identity.schemes.length === 1 ? m.identity.schemes[0] : m.identity.schemes;
  expect('name', c.name, m.identity.name);
  expect('slug', c.slug, m.identity.slug);
  expect('owner', c.owner, m.identity.owner);
  expect('scheme', c.scheme, schemes);
  expect('ios.bundleIdentifier', c.ios?.bundleIdentifier, suffixed(m.identity.ios.bundleIdentifier, appEnv));
  expect('android.package', c.android?.package, suffixed(m.identity.android.package, appEnv));
  expect('extra.eas.projectId', c.extra?.eas?.projectId, m.identity.easProjectId);
  expect('updates.url', c.updates?.url, `https://u.expo.dev/${m.identity.easProjectId}`);
  expect('runtimeVersion', c.runtimeVersion, { policy: 'fingerprint' });
  expect('extra.variant', c.extra?.variant, variant);
  expect('extra.appEnv', c.extra?.appEnv, appEnv);
  expect('extra.router.root', c.extra?.router?.root, `./variants/${variant}/app`);
  expect('version major', String(c.version).split('.')[0], String(m.versioning.major));
  if (!(Number(c.android?.versionCode) >= m.versioning.buildNumberBase)) problems.push(`${appEnv}: android.versionCode ${c.android?.versionCode} is below the base ${m.versioning.buildNumberBase}`);
  if (String(c.ios?.buildNumber) !== String(c.android?.versionCode)) problems.push(`${appEnv}: ios.buildNumber ${c.ios?.buildNumber} differs from android.versionCode ${c.android?.versionCode}`);
  console.log(`${variant}/${appEnv}: ${c.name} ${c.version} (${c.android?.versionCode}) ${c.ios?.bundleIdentifier} / ${c.android?.package}`);
}

if (problems.length) {
  console.error(`::error::expo config sanity failed for ${variant}:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
