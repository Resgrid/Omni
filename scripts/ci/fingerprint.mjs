#!/usr/bin/env node
// Native-or-OTA decisions for release.yml and the guard in ota.yml (omni-plan §6.6.2 principle 2).
//
// The runtime version of every Omni binary is its Expo fingerprint (`runtimeVersion: { policy: 'fingerprint' }`),
// resolved here exactly as eas build / eas update resolve it: `expo-updates runtimeversion:resolve` in apps/omni
// with APP_VARIANT / APP_ENV and the variant's client env. Each GitHub Release carries a `fingerprints.json`
// recording, per platform, the fingerprint of the binaries users have installed and which release holds them.
//
//   decide  release.yml stage 0 — per variant: fingerprint each platform, compare with the newest release of the
//           same variant and channel (excluding this run's own tag, so re-runs stay native), write a decision file.
//   check   ota.yml — refuse (exit 1) unless every requested platform matches the installed runtime.
//   merge   release.yml stage 0 — fold the per-variant decision files into the build / OTA matrices. With
//           --publish-ota false (merge builds on master) a JavaScript-only change publishes no update: an update on
//           the production channel reaches every installed store build, so it is released deliberately (ota.yml).
//
// Usage:
//   node scripts/ci/fingerprint.mjs decide --variant unit --channel internal --platforms android,ios --tag unit-v8.12 [--force-native] --out decision-unit.json
//   node scripts/ci/fingerprint.mjs check  --variant unit --channel production --platforms android,ios [--run-number 12] [--exclude-tag unit-v8.12]
//   node scripts/ci/fingerprint.mjs merge  --dir decisions --variants '["unit"]' --platforms android,ios [--publish-ota false]
import path from 'node:path';

import { appendSummary, appEnvForChannel, csv, findPreviousRelease, parseArgs, PLATFORMS, readJsonIfExists, requireArg, resolveRuntimeVersion, setOutputs, VARIANT_IDS, writeJson } from './lib.mjs';

function decidePlatform({ fingerprint, previous, force }) {
  if (force) return { native: true, reason: 'force_native requested' };
  if (!previous) return { native: true, reason: 'no previous release on this channel' };
  if (!previous.binariesRelease) return { native: true, reason: 'previous release has no binaries for this platform' };
  if (!previous.fingerprint || previous.fingerprint !== fingerprint) return { native: true, reason: `fingerprint changed (${short(previous.fingerprint)} → ${short(fingerprint)})` };
  return { native: false, reason: `fingerprint unchanged; binaries from ${previous.binariesRelease}` };
}

const short = (h) => (h ? String(h).slice(0, 12) : 'none');

async function decide(args) {
  const variant = requireArg(args, 'variant');
  const channel = requireArg(args, 'channel');
  const appEnv = appEnvForChannel(channel);
  const platforms = csv(requireArg(args, 'platforms'), PLATFORMS);
  const tag = requireArg(args, 'tag');
  const force = args['force-native'] === true || args['force-native'] === 'true';
  const out = requireArg(args, 'out');

  const prev = await findPreviousRelease({ variant, channel, excludeTag: tag });
  if (prev.note) console.log(`${variant}: ${prev.note}`);

  const decision = { schema: 1, variant, channel, appEnv, tag, generatedAt: new Date().toISOString(), previousRelease: prev.release, previous: prev.record, platforms: {} };
  for (const platform of platforms) {
    const { runtimeVersion, sources } = resolveRuntimeVersion(variant, appEnv, platform);
    const previous = prev.record?.platforms?.[platform] ?? null;
    const { native, reason } = decidePlatform({ fingerprint: runtimeVersion, previous, force });
    decision.platforms[platform] = { fingerprint: runtimeVersion, sources, native, reason, previousFingerprint: previous?.fingerprint ?? null, previousBinariesRelease: previous?.binariesRelease ?? null };
    console.log(`${variant}/${platform}: ${native ? 'NATIVE' : 'OTA'} — ${reason}`);
  }
  writeJson(out, decision);

  appendSummary(
    [
      `### ${variant} — native or OTA (${channel})`,
      '',
      `Previous release: ${prev.release ?? '_none_'}`,
      '',
      '| Platform | Fingerprint | Decision | Reason |',
      '|---|---|---|---|',
      ...Object.entries(decision.platforms).map(([p, d]) => `| ${p} | \`${short(d.fingerprint)}\` | ${d.native ? '**native build**' : 'OTA update'} | ${d.reason} |`),
      '',
    ].join('\n')
  );
}

async function check(args) {
  const variant = requireArg(args, 'variant');
  const channel = requireArg(args, 'channel');
  const appEnv = appEnvForChannel(channel);
  const platforms = csv(requireArg(args, 'platforms'), PLATFORMS);

  const prev = await findPreviousRelease({ variant, channel, excludeTag: args['exclude-tag'] ? String(args['exclude-tag']) : null });
  // The version (RELEASE_RUN_NUMBER) is part of the expo config. release.yml passes its own run number; ota.yml
  // reuses the run number of the release whose binaries are installed, so the update reports that version.
  const runNumber = args['run-number'] ? String(args['run-number']) : prev.record?.runNumber !== undefined ? String(prev.record.runNumber) : (process.env.RELEASE_RUN_NUMBER ?? '0');
  process.env.RELEASE_RUN_NUMBER = runNumber;
  const rows = [];
  let ok = true;
  for (const platform of platforms) {
    const { runtimeVersion } = resolveRuntimeVersion(variant, appEnv, platform);
    const previous = prev.record?.platforms?.[platform] ?? null;
    const match = Boolean(previous?.binariesRelease) && previous?.fingerprint === runtimeVersion;
    if (!match) ok = false;
    rows.push({ platform, runtimeVersion, installed: previous?.fingerprint ?? null, binariesRelease: previous?.binariesRelease ?? null, match });
  }
  appendSummary(
    [
      `### ${variant} — OTA guard (${channel})`,
      '',
      `Installed runtime from: ${prev.release ?? '_no release found_'}`,
      '',
      '| Platform | Current fingerprint | Installed fingerprint | Binaries | Result |',
      '|---|---|---|---|---|',
      ...rows.map((r) => `| ${r.platform} | \`${short(r.runtimeVersion)}\` | \`${short(r.installed)}\` | ${r.binariesRelease ?? '—'} | ${r.match ? 'match' : '**mismatch — refused**'} |`),
      '',
    ].join('\n')
  );
  for (const r of rows) console.log(`${variant}/${r.platform}: current ${short(r.runtimeVersion)} installed ${short(r.installed)} → ${r.match ? 'OK' : 'MISMATCH'}`);
  setOutputs({ ok: String(ok), previous_release: prev.release ?? '', run_number: runNumber });
  if (!ok) {
    console.error(`::error::Refusing OTA for ${variant} on "${channel}": the JS bundle needs a runtime that no released binary has. Run release.yml (it builds native when the fingerprint changed) instead.`);
    process.exit(1);
  }
}

function merge(args) {
  const dir = requireArg(args, 'dir');
  const variants = JSON.parse(requireArg(args, 'variants'));
  const platforms = args.platforms ? csv(args.platforms, PLATFORMS) : [];
  const publishOta = args['publish-ota'] !== 'false';
  for (const v of variants) if (!VARIANT_IDS.includes(v)) throw new Error(`Unknown variant "${v}"`);

  const android = [];
  const ios = [];
  const ota = [];
  const table = [];
  for (const variant of variants) {
    const decision = readJsonIfExists(path.join(dir, `decision-${variant}.json`));
    const nativePlatforms = [];
    const otaPlatforms = [];
    for (const platform of platforms) {
      const d = decision?.platforms?.[platform];
      // A missing decision (fingerprint job failed) means native: shipping an OTA to an unknown runtime is never safe.
      const native = d ? d.native : true;
      if (native || publishOta) (native ? nativePlatforms : otaPlatforms).push(platform);
      const route = native ? 'native' : publishOta ? 'OTA' : 'JS only — not published';
      table.push(`| ${variant} | ${platform} | ${route} | ${d ? d.reason : 'no decision file — defaulting to native'}${native || publishOta ? '' : '; release it with ota.yml'} |`);
    }
    if (nativePlatforms.includes('android')) android.push({ variant });
    if (nativePlatforms.includes('ios')) ios.push({ variant });
    if (otaPlatforms.length) ota.push({ variant, platform: otaPlatforms.length === PLATFORMS.length ? 'all' : otaPlatforms[0] });
  }

  setOutputs({
    matrix_android: JSON.stringify({ include: android }),
    matrix_ios: JSON.stringify({ include: ios }),
    matrix_ota: JSON.stringify({ include: ota }),
    has_android: String(android.length > 0),
    has_ios: String(ios.length > 0),
    has_ota: String(ota.length > 0),
  });
  if (table.length) appendSummary(['### Release plan — native or OTA', '', '| Variant | Platform | Path | Reason |', '|---|---|---|---|', ...table, ''].join('\n'));
  console.log(JSON.stringify({ android, ios, ota }, null, 2));
}

const commands = { decide, check, merge };
const args = parseArgs();
const command = args._[0];
if (!commands[command]) {
  console.error(`usage: fingerprint.mjs <${Object.keys(commands).join('|')}> [options]`);
  process.exit(2);
}
Promise.resolve(commands[command](args)).catch((error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});
