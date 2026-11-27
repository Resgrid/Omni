#!/usr/bin/env node
// Which variants a change reaches, and the platforms app-platforms.yml tests each on. Mirrors the Software Factory's
// rule (int-RASF `affectedApps`), which requires the `<platform> (<variant>)` check of every variant a pull request
// reaches: a change inside apps/omni/variants/<v>/ reaches that variant; any other path (shared packages, apps/desktop,
// build configuration, the lockfile, docs) reaches every variant. Keep the two in step.
//
// Usage: node scripts/ci/affected-variants.mjs [--base <sha> --head <sha>] [--variants all|unit,ic] [--platforms all|ios,android,electron]
//   Without --base (merge queue, manual runs) every selected variant is tested. A diff that cannot be read tests every
//   selected variant too, so a check is never left out by mistake.
// Outputs (and prints): variants, ios, android, electron — JSON arrays of variants
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { appendSummary, csv, parseArgs, setOutputs, VARIANT_IDS } from './lib.mjs';

export const TEST_PLATFORMS = ['ios', 'android', 'electron'];
const VARIANT_PATH = /^apps\/omni\/variants\/([^/]+)\//;

/** The variants the changed paths reach: every variant as soon as one path is outside a variant's own folder. */
export function affectedVariants(paths, variants = VARIANT_IDS) {
  const own = new Set();

  for (const file of paths) {
    const match = VARIANT_PATH.exec(file.replace(/\\/g, '/'));

    if (!match || !variants.includes(match[1])) return { variants: [...variants], shared: true };
    own.add(match[1]);
  }

  return { variants: variants.filter((v) => own.has(v)), shared: false };
}

/** Every variant to test on every selected platform. */
export function platformMatrix(variants, platforms = TEST_PLATFORMS) {
  return Object.fromEntries(TEST_PLATFORMS.map((p) => [p, platforms.includes(p) ? variants : []]));
}

function changedPaths(base, head) {
  const result = spawnSync('git', ['diff', '--name-only', '--no-renames', base, head], { encoding: 'utf8' });

  if (result.status !== 0) {
    console.error(`::warning::Could not diff ${base}..${head} (${(result.stderr || '').trim()}); testing every selected variant.`);

    return undefined;
  }

  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function main() {
  const args = parseArgs();
  const pick = (value, all) => (!value || value === true || value === 'all' ? [...all] : csv(value, all));
  const selected = pick(args.variants, VARIANT_IDS);
  const platforms = pick(args.platforms, TEST_PLATFORMS);

  if (!selected.length) throw new Error('No variants selected.');
  const paths = args.base && args.base !== true ? changedPaths(String(args.base), String(args.head ?? 'HEAD')) : undefined;
  const reach = paths ? affectedVariants(paths, selected) : { variants: selected, shared: true };
  const matrix = platformMatrix(reach.variants, platforms);
  setOutputs({ variants: JSON.stringify(reach.variants), ...Object.fromEntries(Object.entries(matrix).map(([p, v]) => [p, JSON.stringify(v)])) });
  appendSummary(
    paths
      ? reach.shared
        ? `**App platforms:** the change touches shared code, so every variant is tested: ${reach.variants.join(', ')}.\n`
        : `**App platforms:** the change touches only ${reach.variants.join(', ') || 'no variant'}'s own code.\n`
      : `**App platforms:** testing ${reach.variants.join(', ')}.\n`
  );
  console.log(JSON.stringify({ shared: reach.shared, ...matrix }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
