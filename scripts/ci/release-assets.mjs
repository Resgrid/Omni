#!/usr/bin/env node
// Assembles one variant's GitHub Release folder (release.yml stage 3, omni-plan §6.6.4):
//   - copies every build output (already named <Prefix>-<version>-<target>.<ext> by the build jobs)
//   - writes fingerprints.json: per platform, the runtime fingerprint of the binaries this release holds (or, for a
//     platform this run did not build, the record carried from the previous release). ota.yml's hotfix guard and
//     the next release.yml compare against it.
//   - writes SHA256SUMS (sha256sum format) over every asset
//   - writes a Markdown summary for the release body (--summary, outside the asset folder)
//
// Usage: node scripts/ci/release-assets.mjs --variant unit --tag unit-v8.12 --version 8.12 --build-number 100012 --run 12 \
//          --channel internal --commit <sha> --artifacts artifacts --out release [--decision artifacts/decision/decision-unit.json] \
//          [--docker-tags "a,b"] [--product-name "Resgrid Unit"] [--summary release-summary.md]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { appEnvForChannel, findPreviousRelease, listFiles, parseArgs, PLATFORMS, readJsonIfExists, requireArg, setOutputs, writeJson } from './lib.mjs';

const args = parseArgs();
const variant = requireArg(args, 'variant');
const tag = requireArg(args, 'tag');
const version = requireArg(args, 'version');
const buildNumber = Number(requireArg(args, 'build-number'));
const run = Number(requireArg(args, 'run'));
const channel = requireArg(args, 'channel');
const commit = requireArg(args, 'commit');
const artifactsDir = path.resolve(requireArg(args, 'artifacts'));
const outDir = path.resolve(requireArg(args, 'out'));
const decision = args.decision ? readJsonIfExists(args.decision) : null;
const dockerTags = args['docker-tags'] ? String(args['docker-tags']).split(',').filter(Boolean) : [];
const productName = args['product-name'] ? String(args['product-name']) : variant;
const summaryFile = path.resolve(args.summary ? String(args.summary) : 'release-summary.md');
if (path.dirname(summaryFile) === outDir) throw new Error('--summary must be outside the asset folder (--out).');

const METADATA = new Set(['SHA256SUMS', 'fingerprints.json']);

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Binaries from the build jobs (android-<v>, ios-<v>, electron-<v>-<os>, web zip made by the workflow).
  for (const rel of listFiles(artifactsDir)) {
    const name = path.basename(rel);
    if (METADATA.has(name) || name.startsWith('.')) continue;
    const dest = path.join(outDir, name);
    if (fs.existsSync(dest)) continue;
    fs.copyFileSync(path.join(artifactsDir, rel), dest);
  }
  const assets = fs.readdirSync(outDir).filter((n) => !METADATA.has(n));
  const has = (suffix) => assets.find((n) => n.endsWith(suffix)) ?? null;
  const binaries = { android: has('-android.aab'), ios: has('-ios-appstore.ipa') };

  // 2. fingerprints.json — carry the chain forward even for runs that did not touch a platform.
  let previous = decision?.previous ?? null;
  let previousRelease = decision?.previousRelease ?? null;
  if (!decision) {
    const prev = await findPreviousRelease({ variant, channel, excludeTag: tag });
    previous = prev.record;
    previousRelease = prev.release;
    if (prev.note) console.log(`${variant}: ${prev.note}`);
  }
  const platforms = {};
  for (const p of PLATFORMS) {
    const d = decision?.platforms?.[p];
    if (d) {
      platforms[p] = binaries[p] ? { fingerprint: d.fingerprint, native: true, binariesRelease: tag } : { fingerprint: d.fingerprint, native: true, binariesRelease: null, failed: true };
    } else if (binaries[p]) {
      // Built without a decision (fingerprint job failed): an unknown fingerprint, which ota.yml's guard never matches.
      platforms[p] = { fingerprint: null, native: true, binariesRelease: tag };
    } else if (previous?.platforms?.[p]) {
      platforms[p] = { ...previous.platforms[p], carriedFrom: previousRelease };
    }
  }
  const fingerprints = { schema: 1, variant, channel, appEnv: appEnvForChannel(channel), tag, version, buildNumber, runNumber: run, commit, createdAt: new Date().toISOString(), previousRelease, platforms };
  writeJson(path.join(outDir, 'fingerprints.json'), fingerprints);

  // 3. SHA256SUMS over every asset (including fingerprints.json).
  const sums = fs
    .readdirSync(outDir)
    .filter((n) => n !== 'SHA256SUMS')
    .sort()
    .map((n) => `${sha256(path.join(outDir, n))}  ${n}`);
  fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), sums.join('\n') + '\n');

  // 4. Summary for the release body.
  const row = (p) => {
    const r = platforms[p];
    if (!r) return `| ${p} | — | not part of this run |`;
    if (r.carriedFrom) return `| ${p} | not built in this run | binaries in ${r.binariesRelease ?? '—'} |`;
    if (r.binariesRelease === tag) return `| ${p} | native build | \`${short(r.fingerprint)}\` — binaries attached |`;
    return `| ${p} | native build **failed** | re-run the failed job to complete this release |`;
  };
  const summary = [
    `## ${productName} ${version}`,
    '',
    `Channel **${channel}** · build ${buildNumber} · run ${run} · commit ${commit.slice(0, 12)}`,
    '',
    '| Platform | Path | Details |',
    '|---|---|---|',
    row('android'),
    row('ios'),
    ...(dockerTags.length ? ['', `Docker: ${dockerTags.map((t) => `\`${t}\``).join(', ')}`] : []),
    '',
    `Verify downloads with \`sha256sum -c SHA256SUMS\`.`,
    '',
  ].join('\n');
  fs.writeFileSync(summaryFile, summary);

  // Publish when there is something to download.
  setOutputs({
    has_assets: String(assets.length > 0),
    apk: has('-android.apk') ? path.join(outDir, has('-android.apk')) : '',
    native_built: String(Boolean(binaries.android || binaries.ios)),
  });
  console.log(JSON.stringify({ assets, fingerprints }, null, 2));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const short = (h) => (h ? String(h).slice(0, 12) : 'unknown');

main().catch((error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});
