#!/usr/bin/env node
// Release planning (omni-plan §6.6.4, stage 0). Emits, for the requested variants, the version numbers
// and the build matrix that release.yml fans out over. Versions are computed once here and passed to
// every build job — build jobs never compute versions themselves.
//
// Usage: node scripts/release-plan.mjs --run <number> [--variants all|unit,ic] [--targets all|ios,android,web,docker,electron]
// Writes `variants`, `matrix_mobile`, `matrix_web`, `matrix_electron` and `versions` to $GITHUB_OUTPUT when set.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { VARIANT_IDS, loadVariant, computeVariantVersion } = require('@resgrid/config-plugins');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const run = Number(arg('run', process.env.GITHUB_RUN_NUMBER ?? '0'));
const variantsArg = arg('variants', 'all');
const targetsArg = arg('targets', 'all');

const variants =
  variantsArg === 'all'
    ? [...VARIANT_IDS]
    : variantsArg
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
for (const v of variants) if (!VARIANT_IDS.includes(v)) throw new Error(`Unknown variant "${v}"`);
const allTargets = ['ios', 'android', 'web', 'docker', 'electron'];
const targets = targetsArg === 'all' ? allTargets : targetsArg.split(',').map((t) => t.trim());
for (const t of targets) if (!allTargets.includes(t)) throw new Error(`Unknown target "${t}"`);

const versions = {};
for (const v of variants) {
  const m = loadVariant(v);
  versions[v] = { ...computeVariantVersion(m, run), dockerImage: m.identity.web.dockerImage, productName: m.identity.electron.productName, artifactPrefix: m.identity.name.replace(/\s+/g, '') };
}

const mobile = [];
for (const v of variants) {
  if (targets.includes('android')) mobile.push({ variant: v, platform: 'android', runner: 'ubuntu-latest' });
  if (targets.includes('ios')) mobile.push({ variant: v, platform: 'ios', runner: 'macos-26' });
}
const needsWeb = targets.some((t) => ['web', 'docker', 'electron'].includes(t));
const web = needsWeb ? variants.map((v) => ({ variant: v })) : [];
const electron = targets.includes('electron')
  ? variants.flatMap((v) => [
      { variant: v, os: 'windows-latest', target: 'win' },
      { variant: v, os: 'macos-15', target: 'mac' },
      { variant: v, os: 'ubuntu-latest', target: 'linux' },
    ])
  : [];

const outputs = {
  variants: JSON.stringify(variants),
  versions: JSON.stringify(versions),
  matrix_mobile: JSON.stringify({ include: mobile }),
  matrix_web: JSON.stringify({ include: web }),
  matrix_electron: JSON.stringify({ include: electron }),
  docker: String(targets.includes('docker')),
};

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n'
  );
}
console.log(JSON.stringify({ run, variants, targets, versions, jobs: { mobile: mobile.length, web: web.length, electron: electron.length } }, null, 2));
