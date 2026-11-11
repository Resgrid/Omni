#!/usr/bin/env node
// Runtime fingerprints for release.yml and the hotfix guard in ota.yml (omni-plan §6.6.2 principle 2).
//
// The runtime version of every Omni binary is its Expo fingerprint (`runtimeVersion: { policy: 'fingerprint' }`),
// resolved here exactly as eas build / eas update resolve it: `expo-updates runtimeversion:resolve` in apps/omni
// with APP_VARIANT / APP_ENV and the variant's client env. Each GitHub Release carries a `fingerprints.json`
// recording, per platform, the fingerprint of the binaries it holds and which release holds them.
//
// Every release.yml run builds native binaries; EAS updates are for critical and emergency fixes only and come from
// the hotfix branch through ota.yml (owner decision 2026-11-10).
//
//   decide  release.yml stage 0 — per variant: fingerprint each platform this run builds and compare it with the
//           newest release of the same variant and channel (excluding this run's own tag), so the summary shows
//           whether a hotfix update for earlier builds can also reach this one. Writes the decision file that
//           release-assets.mjs turns into fingerprints.json.
//   check   ota.yml — refuse (exit 1) unless binaries released on the channel run the current runtime on every
//           requested platform. Matches the newest such release, not just the newest release: master merges build
//           release candidates that may not have reached the stores yet, and a hotfix cut from the store build must
//           still reach it.
//
// Usage:
//   node scripts/ci/fingerprint.mjs decide --variant unit --channel internal --platforms android,ios --tag unit-v8.12 --out decision-unit.json
//   node scripts/ci/fingerprint.mjs check  --variant unit --channel production --platforms android,ios
import { appendSummary, appEnvForChannel, csv, findPreviousRelease, parseArgs, PLATFORMS, requireArg, resolveRuntimeVersion, runsRuntime, setOutputs, writeJson } from './lib.mjs';

const short = (h) => (h ? String(h).slice(0, 12) : 'none');

function compare(fingerprint, previous) {
  if (!previous) return 'no earlier release on this channel';

  if (!previous.binariesRelease) return 'the earlier release has no binaries for this platform';

  if (previous.fingerprint !== fingerprint) return `runtime changed (${short(previous.fingerprint)} → ${short(fingerprint)}); hotfix updates for earlier builds will not reach this one`;

  return `runtime unchanged since ${previous.binariesRelease}`;
}

async function decide(args) {
  const variant = requireArg(args, 'variant');
  const channel = requireArg(args, 'channel');
  const appEnv = appEnvForChannel(channel);
  const platforms = csv(requireArg(args, 'platforms'), PLATFORMS);
  const tag = requireArg(args, 'tag');
  const out = requireArg(args, 'out');

  const prev = await findPreviousRelease({ variant, channel, excludeTag: tag });

  if (prev.note) console.log(`${variant}: ${prev.note}`);

  const decision = { schema: 1, variant, channel, appEnv, tag, generatedAt: new Date().toISOString(), previousRelease: prev.release, previous: prev.record, platforms: {} };

  for (const platform of platforms) {
    const { runtimeVersion, sources } = resolveRuntimeVersion(variant, appEnv, platform);
    const previous = prev.record?.platforms?.[platform] ?? null;
    const reason = compare(runtimeVersion, previous);

    decision.platforms[platform] = { fingerprint: runtimeVersion, sources, native: true, reason, previousFingerprint: previous?.fingerprint ?? null, previousBinariesRelease: previous?.binariesRelease ?? null };
    console.log(`${variant}/${platform}: ${short(runtimeVersion)} — ${reason}`);
  }

  writeJson(out, decision);

  appendSummary(
    [
      `### ${variant} — runtime fingerprints (${channel})`,
      '',
      `Previous release: ${prev.release ?? '_none_'}`,
      '',
      '| Platform | Fingerprint | Compared with the previous release |',
      '|---|---|---|',
      ...Object.entries(decision.platforms).map(([p, d]) => `| ${p} | \`${short(d.fingerprint)}\` | ${d.reason} |`),
      '',
    ].join('\n')
  );
}

async function check(args) {
  const variant = requireArg(args, 'variant');
  const channel = requireArg(args, 'channel');
  const appEnv = appEnvForChannel(channel);
  const platforms = csv(requireArg(args, 'platforms'), PLATFORMS);

  // The fingerprint skips the version (apps/omni/fingerprint.config.js), so the run number set here does not matter.
  const runtimes = Object.fromEntries(platforms.map((platform) => [platform, resolveRuntimeVersion(variant, appEnv, platform).runtimeVersion]));
  const found = await findPreviousRelease({ variant, channel, match: (record) => runsRuntime(record, runtimes) });
  const ok = Boolean(found.record);
  // The version (RELEASE_RUN_NUMBER) is part of the expo config: the update reports the version of the matched release.
  const runNumber = found.record?.runNumber !== undefined ? String(found.record.runNumber) : (process.env.RELEASE_RUN_NUMBER ?? '0');
  const rows = platforms.map((platform) => {
    const installed = found.record?.platforms?.[platform] ?? null;

    return { platform, runtimeVersion: runtimes[platform], binariesRelease: installed?.binariesRelease ?? null };
  });

  appendSummary(
    [
      `### ${variant} — hotfix update guard (${channel})`,
      '',
      `Released binaries running this runtime: ${found.release ?? '_none — refused_'}`,
      ...(found.skipped.length ? ['', `Newer releases on this channel have no binaries running this runtime and will not receive this update: ${found.skipped.join(', ')}`] : []),
      '',
      '| Platform | Runtime | Binaries |',
      '|---|---|---|',
      ...rows.map((r) => `| ${r.platform} | \`${short(r.runtimeVersion)}\` | ${r.binariesRelease ?? '**none — refused**'} |`),
      '',
    ].join('\n')
  );

  for (const r of rows) console.log(`${variant}/${r.platform}: runtime ${short(r.runtimeVersion)} → ${r.binariesRelease ? `binaries in ${r.binariesRelease}` : 'NO RELEASED BINARIES'}`);

  if (found.skipped.length) console.log(`::warning::${variant}: ${found.skipped.join(', ')} have no binaries running this runtime and will not receive this update.`);

  setOutputs({ ok: String(ok), previous_release: found.release ?? '', run_number: runNumber });

  if (!ok) {
    console.error(
      `::error::Refusing the update for ${variant} on "${channel}": no released binaries on this channel run this JavaScript bundle's runtime (${found.note}). A fix that changes native code ships through release.yml and the stores.`
    );
    process.exit(1);
  }
}

const commands = { decide, check };
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
