#!/usr/bin/env node
// Resolves variant selections for workflows that do not need release-plan.mjs versions (nightly.yml, ota.yml).
//
// Usage: node scripts/ci/variants-matrix.mjs --variants all|unit,ic [--e2e rotate|all|none|unit,ic] [--day <n>]
// Outputs (and prints): variants  — JSON array of the selected variants
//                       e2e       — JSON array for end-to-end runs; `rotate` picks one variant per UTC day
import { csv, parseArgs, setOutputs, VARIANT_IDS } from './lib.mjs';

const args = parseArgs();
const pick = (value) => (!value || value === true || value === 'all' ? [...VARIANT_IDS] : csv(value, VARIANT_IDS));
const variants = pick(args.variants);
if (!variants.length) throw new Error('No variants selected.');

let e2e = [];
const mode = args.e2e === undefined || args.e2e === true ? 'none' : String(args.e2e);
if (mode === 'rotate') {
  const now = new Date();
  const day = args.day !== undefined ? Number(args.day) : Math.floor((now - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86_400_000);
  e2e = [variants[day % variants.length]];
} else if (mode === 'all') {
  e2e = variants;
} else if (mode !== 'none') {
  e2e = csv(mode, VARIANT_IDS).filter((v) => variants.includes(v));
}

setOutputs({ variants: JSON.stringify(variants), e2e: JSON.stringify(e2e) });
console.log(JSON.stringify({ variants, e2e }));
