#!/usr/bin/env node
// Picks (and if needed derives, in the CI checkout only) the eas.json profiles for release builds and submits.
//
// release: production channel → `<v>-production-aab` (Android) / `<v>-production` (iOS), unchanged.
//          internal / staging → `<v>-<channel>-aab` / `<v>-<channel>-store`. The expo-updates channel is baked into
//          the binary, so a master (internal) build must not reuse the production profile. Until
//          scripts/generate-eas-json.mjs emits those profiles, both are derived from the production profiles with
//          `channel` and `env.APP_ENV` replaced and written to the runner's eas.json (never committed).
//          eas.json is a fingerprint source, so EVERY job that resolves a runtime version for this variant
//          (fingerprint, android, ios, ota, ota.yml) runs this same command first — the derived file is then
//          byte-identical everywhere and the fingerprints agree.
// dev:     nightly developer builds use `<v>-dev-sim`. Its Android debug APK needs no release keystore, so when
//          the profile lacks `android.withoutCredentials` a `<v>-dev-sim-ci` copy with it set is derived.
// submit:  adds the non-interactive submit settings (ascAppId, App Store Connect API key, Play service account
//          and track) from the environment to `submit.<v>-production` in the runner's eas.json.
//
// Usage:
//   node scripts/ci/eas-profile.mjs release --variant unit --channel internal      → android_profile, ios_profile
//   node scripts/ci/eas-profile.mjs dev     --variant unit --platform android      → profile
//   node scripts/ci/eas-profile.mjs submit  --variant unit --platform ios          → profile
import fs from 'node:fs';
import path from 'node:path';

import { appEnvForChannel, assertVariant, omniRoot, parseArgs, PLATFORMS, requireArg, setOutputs } from './lib.mjs';

const easJsonPath = path.join(omniRoot, 'eas.json');

function load() {
  return JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
}

function save(easJson) {
  fs.writeFileSync(easJsonPath, JSON.stringify(easJson, null, 2) + '\n');
}

function release(args) {
  const variant = assertVariant(requireArg(args, 'variant'));
  const channel = requireArg(args, 'channel');
  const appEnv = appEnvForChannel(channel);
  const easJson = load();
  const out = {};
  let changed = false;

  // Fixed order (android, then ios) keeps the derived eas.json identical in every job.
  for (const platform of PLATFORMS) {
    const base = platform === 'android' ? `${variant}-production-aab` : `${variant}-production`;
    if (!easJson.build?.[base]) throw new Error(`eas.json has no "${base}" profile — run pnpm eas:generate.`);
    if (channel === 'production') {
      out[`${platform}_profile`] = base;
      continue;
    }
    const name = platform === 'android' ? `${variant}-${channel}-aab` : `${variant}-${channel}-store`;
    if (!easJson.build[name]) {
      const profile = structuredClone(easJson.build[base]);
      profile.channel = channel;
      profile.env = { ...profile.env, APP_ENV: appEnv };
      easJson.build[name] = profile;
      changed = true;
      console.error(`::notice::Derived eas.json profile "${name}" from "${base}" (channel ${channel}) in this checkout. Add it to scripts/generate-eas-json.mjs to make it permanent.`);
    }
    out[`${platform}_profile`] = name;
  }
  if (changed) save(easJson);
  return out;
}

function dev(args) {
  const variant = assertVariant(requireArg(args, 'variant'));
  const platform = requireArg(args, 'platform');
  if (!PLATFORMS.includes(platform)) throw new Error(`Unknown platform "${platform}"`);
  const easJson = load();
  const base = `${variant}-dev-sim`;
  if (!easJson.build?.[base]) throw new Error(`eas.json has no "${base}" profile — run pnpm eas:generate.`);
  if (platform === 'ios' || easJson.build[base].android?.withoutCredentials) return { profile: base };

  const name = `${base}-ci`;
  if (!easJson.build[name]) {
    const profile = structuredClone(easJson.build[base]);
    profile.android = { ...profile.android, withoutCredentials: true };
    easJson.build[name] = profile;
    save(easJson);
    console.error(`::notice::Derived eas.json profile "${name}" (android.withoutCredentials) in this checkout.`);
  }
  return { profile: name };
}

function submit(args) {
  const variant = assertVariant(requireArg(args, 'variant'));
  const platform = requireArg(args, 'platform');
  const easJson = load();
  const name = `${variant}-production`;
  const env = process.env;
  const profile = (easJson.submit ??= {})[name] ?? {};

  if (platform === 'ios') {
    const ios = { ...profile.ios };
    if (env.ASC_APP_ID) ios.ascAppId = env.ASC_APP_ID;
    if (env.EXPO_ASC_API_KEY_PATH) ios.ascApiKeyPath = env.EXPO_ASC_API_KEY_PATH;
    if (env.EXPO_ASC_ISSUER_ID) ios.ascApiKeyIssuerId = env.EXPO_ASC_ISSUER_ID;
    if (env.EXPO_ASC_KEY_ID) ios.ascApiKeyId = env.EXPO_ASC_KEY_ID;
    if (env.IOS_APPLE_TEAM_ID) ios.appleTeamId = env.IOS_APPLE_TEAM_ID;
    if (!ios.ascAppId) throw new Error('ASC_APP_ID is required for a non-interactive App Store submission.');
    profile.ios = ios;
  } else if (platform === 'android') {
    const android = { ...profile.android, track: env.PLAY_TRACK || 'internal' };
    if (env.PLAY_SERVICE_ACCOUNT_KEY_PATH) android.serviceAccountKeyPath = env.PLAY_SERVICE_ACCOUNT_KEY_PATH;
    profile.android = android;
  } else {
    throw new Error(`Unknown platform "${platform}"`);
  }
  easJson.submit[name] = profile;
  save(easJson);
  return { profile: name };
}

const commands = { release, dev, submit };
const args = parseArgs();
const command = args._[0];
if (!commands[command]) {
  console.error(`usage: eas-profile.mjs <${Object.keys(commands).join('|')}> [options]`);
  process.exit(2);
}
try {
  const outputs = commands[command](args);
  setOutputs(outputs);
  console.log(JSON.stringify(outputs));
} catch (error) {
  console.error(`::error::${error.message}`);
  process.exit(1);
}
