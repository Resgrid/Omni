#!/usr/bin/env node
// Every check that can fail a PR in CI (.github/workflows/ci.yml) or a commit (lefthook.yml), in one command:
// lockfile, Prettier, ESLint, anti-slop, TypeScript, translations, dependency rules, variant manifests, eas.json, workflow files,
// CI script tests, Jest, then per variant the expo config sanity check, web export and Playwright web tests.
// Every step runs even after a failure; the summary at the end lists what failed. A check added to ci.yml goes here too.
// A complete run (no --variants or --skip) that passes is recorded, so the Claude Code Stop hook (scripts/ci/check-all-hook.mjs)
// does not run it again on the same checkout.
//
// Usage: pnpm check-all [--quick] [--variants unit,ic] [--skip jest,e2e] [--bail] [--list]
//   --quick     skip the web exports and Playwright tests (the slow part)
//   --variants  limit the per-variant steps (default: all five)
//   --skip      step ids to leave out; `e2e` skips every `e2e:<variant>` step. `--skip web-export` tests the existing exports.
//   --bail      stop at the first failure
//   --list      print the step ids and exit
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { checkoutFingerprint, recordPass } from './ci/check-all-hook.mjs';
import { csv, parseArgs, repoRoot, VARIANT_IDS } from './ci/lib.mjs';

// pnpm 10 forwards a `--` separator literally.
const args = parseArgs(process.argv.slice(2).filter((a) => a !== '--'));
const unknown = Object.keys(args).filter((k) => !['_', 'quick', 'variants', 'skip', 'bail', 'list'].includes(k));
if (unknown.length > 0) {
  console.error(`Unknown option ${unknown.map((k) => `--${k}`).join(', ')}. Usage: pnpm check-all [--quick] [--variants unit,ic] [--skip jest,e2e] [--bail] [--list]`);
  process.exit(2);
}
const variants = args.variants ? csv(args.variants, VARIANT_IDS) : VARIANT_IDS;
const rootScripts = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts;
const run = (script) => ['pnpm', 'run', script];

const steps = [
  { id: 'lockfile', label: 'pnpm-lock.yaml matches every package.json', cmd: ['pnpm', 'install', '--frozen-lockfile', '--lockfile-only'] },
  { id: 'format', label: 'Prettier (pre-commit hook)', cmd: run('format:check') },
  { id: 'lint', label: 'ESLint', cmd: run('lint') },
  { id: 'anti-slop', label: 'Anti-slop (Oxlint, no new findings)', cmd: run('lint:anti-slop') },
  { id: 'type-check', label: 'TypeScript', cmd: run('type-check') },
  { id: 'i18n', label: 'Translation parity', cmd: run('i18n:check') },
  { id: 'deps', label: 'Dependency rules', cmd: run('deps:check') },
  { id: 'variants', label: 'Variant manifests', cmd: run('variants:check') },
  { id: 'eas', label: 'eas.json is up to date', cmd: run('eas:check') },
  { id: 'workflows', label: 'Workflow files', cmd: run('workflows:check') },
  { id: 'ci-scripts', label: 'CI script tests', cmd: ['node', '--test', 'scripts/ci/__tests__/*.test.mjs'] },
  // ci.yml runs these with --if-present, so they join as soon as the root scripts exist.
  ...['contract:check', 'routes:check'].filter((s) => rootScripts[s]).map((s) => ({ id: s.split(':')[0], label: s, cmd: run(s) })),
  { id: 'jest', label: 'Jest', cmd: ['pnpm', 'exec', 'jest', '--ci', '--passWithNoTests'] },
  ...variants.map((v) => ({ id: `expo-config:${v}`, label: `expo config sanity (${v})`, cmd: ['node', 'scripts/ci/expo-config-sanity.mjs', '--variant', v] })),
];
if (!args.quick) {
  steps.push({ id: 'playwright-install', label: 'Playwright Chromium', cmd: ['node', 'scripts/ci/run-playwright.mjs', 'install', 'chromium'] });
  for (const v of variants) {
    const env = { APP_VARIANT: v, APP_ENV: 'production', E2E_VARIANT: v };
    steps.push({ id: `web-export:${v}`, label: `Web export (${v})`, cmd: ['pnpm', '--filter', '@resgrid/omni', 'web:export'], env });
    steps.push({
      id: `e2e:${v}`,
      label: `Web acceptance tests (${v})`,
      cmd: ['node', 'scripts/ci/run-playwright.mjs', 'test', '-c', 'apps/omni/e2e/playwright.config.ts', '--project', `web-${v}`, '--forbid-only'],
      env,
      needs: [`web-export:${v}`, 'playwright-install'],
    });
  }
}

if (args.list) {
  for (const s of steps) console.log(`${s.id.padEnd(22)} ${s.label}`);
  process.exit(0);
}

const skip = new Set(args.skip ? csv(args.skip) : []);
const group = (id) => id.split(':')[0];
const knownIds = new Set(steps.flatMap((s) => [s.id, group(s.id)]));
const unknownSkips = [...skip].filter((id) => !knownIds.has(id));
if (unknownSkips.length > 0) {
  console.error(`Unknown step ${unknownSkips.join(', ')} in --skip. \`pnpm check-all --list\` shows the step ids.`);
  process.exit(2);
}

const seconds = (ms) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`);
const fingerprint = () => {
  try {
    return checkoutFingerprint();
  } catch {
    return null;
  }
};

const passLevel = args.variants || skip.size > 0 ? null : args.quick ? 'quick' : 'full';
const checkedCheckout = passLevel === null ? null : fingerprint();
const results = new Map();
const startedAll = Date.now();

for (const step of steps) {
  if (skip.has(step.id) || skip.has(group(step.id))) {
    results.set(step.id, { status: 'skip', note: '--skip' });
    continue;
  }
  const failedNeed = step.needs?.find((id) => results.get(id)?.status === 'FAIL');
  if (failedNeed) {
    results.set(step.id, { status: 'skip', note: `${failedNeed} failed` });
    continue;
  }
  console.log(`\n━━ ${step.label}: ${step.cmd.join(' ')}\n`);
  const started = Date.now();
  const r = spawnSync(step.cmd[0], step.cmd.slice(1), {
    cwd: repoRoot,
    env: { ...process.env, EXPO_NO_TELEMETRY: '1', EXPO_NO_DOTENV: '1', ...step.env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  // Ctrl+C reaches the child too; stop instead of moving on to the next step.
  if (r.signal === 'SIGINT') process.exit(130);
  if (r.error) console.error(`${step.cmd[0]} could not start: ${r.error.message}`);
  results.set(step.id, { status: r.status === 0 ? 'pass' : 'FAIL', note: seconds(Date.now() - started) });
  if (r.status !== 0 && args.bail) break;
}

console.log('\n━━ Summary\n');
for (const s of steps) {
  const r = results.get(s.id) ?? { status: 'skip', note: '--bail' };
  console.log(`  ${r.status.padEnd(4)}  ${s.id.padEnd(22)} ${r.note}`);
}
const counts = (status) => [...results.values()].filter((r) => r.status === status).length;
const failed = counts('FAIL');
console.log(`\n${counts('pass')} passed, ${failed} failed, ${steps.length - counts('pass') - failed} skipped in ${seconds(Date.now() - startedAll)}`);

// Only when nothing changed during the run: a pass says nothing about edits made after a step had checked its files.
if (failed === 0 && checkedCheckout !== null && fingerprint() === checkedCheckout) {
  try {
    recordPass(checkedCheckout, passLevel);
  } catch (error) {
    console.error(`Could not record the pass for the Claude Code hook: ${error.message}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
