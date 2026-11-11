#!/usr/bin/env node
// Picks (and if needed derives, in the CI checkout only) the eas.json profiles for release and nightly builds. CI never
// submits to a store: store uploads are done by hand through the Software Factory (omni-plan §15 #20).
//
// release: production channel → `<v>-production` (Android AAB and App Store IPA) and `<v>-production-apk` (the
//          sideload APK, a second Android build: signing stays on EAS, so nothing can re-sign the AAB's APKs).
//          internal / staging → `<v>-<channel>-store` / `<v>-<channel>-apk`. The expo-updates channel is baked into
//          the binary, so a master (internal) build must not reuse the production profile. When
//          scripts/generate-eas-json.mjs lacks one, it is derived from the production profile with `channel` and
//          `env.APP_ENV` replaced and written to the runner's eas.json (never committed).
//          eas.json is a fingerprint source, so EVERY job that resolves a runtime version for this variant
//          (fingerprint, android, ios, ota.yml) runs this same command first — the derived file is then
//          byte-identical everywhere and the fingerprints agree.
// dev:     nightly developer builds use `<v>-dev-sim`. Its Android debug APK needs no release keystore, so when
//          the profile lacks `android.withoutCredentials` a `<v>-dev-sim-ci` copy with it set is derived.
//
// Usage:
//   node scripts/ci/eas-profile.mjs release --variant unit --channel internal      → android_profile, android_apk_profile, ios_profile
//   node scripts/ci/eas-profile.mjs dev     --variant unit --platform android      → profile
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

// Output → [production profile, suffix of the other channels' profile]. The AAB and the App Store IPA share one profile.
const RELEASE_PROFILES = {
  android_profile: ['production', 'store'],
  android_apk_profile: ['production-apk', 'apk'],
  ios_profile: ['production', 'store'],
};

function release(args) {
  const variant = assertVariant(requireArg(args, 'variant'));
  const channel = requireArg(args, 'channel');
  const appEnv = appEnvForChannel(channel);
  const easJson = load();
  const out = {};
  let changed = false;

  // Fixed order keeps the derived eas.json identical in every job.
  for (const [output, [production, suffix]] of Object.entries(RELEASE_PROFILES)) {
    const base = `${variant}-${production}`;
    if (!easJson.build?.[base]) throw new Error(`eas.json has no "${base}" profile — run pnpm eas:generate.`);
    if (channel === 'production') {
      out[output] = base;
      continue;
    }
    const name = `${variant}-${channel}-${suffix}`;
    if (!easJson.build[name]) {
      const profile = structuredClone(easJson.build[base]);
      profile.channel = channel;
      profile.env = { ...profile.env, APP_ENV: appEnv };
      easJson.build[name] = profile;
      changed = true;
      console.error(`::notice::Derived eas.json profile "${name}" from "${base}" (channel ${channel}) in this checkout. Add it to scripts/generate-eas-json.mjs to make it permanent.`);
    }
    out[output] = name;
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

const commands = { release, dev };
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
