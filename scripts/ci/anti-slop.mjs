#!/usr/bin/env node
// Anti-slop ratchet (tooling/oxlint/anti-slop/UPSTREAM.md). Runs Oxlint with the anti-slop rules in .oxlintrc.json and
// compares the findings, per file and rule, with tooling/oxlint/anti-slop-baseline.json: code written before the rules
// arrived keeps its findings until someone fixes them, and no file may gain one. Runs in the pre-commit hook
// (lefthook.yml), `pnpm check-all`, CI (ci.yml, lint job) and, for Claude Code, after every file edit (.claude/settings.json).
//
// Usage: pnpm lint:anti-slop [--prune] [--rebaseline]
//   (no option)   fail when a file has more findings of a rule than the baseline allows, when the baseline still lists
//                 findings that are gone (run --prune), or when Oxlint could not read or parse a file
//   --prune       lower the baseline to the findings that remain; it never raises a count
//   --rebaseline  rewrite the baseline from the current findings, new ones included. Owner only, after a rule or plugin
//                 change; never to make a check pass
//   --hook        Claude Code PostToolUse hook: reads the hook input on stdin and checks only the edited file
// Every finding in some files, baseline ignored: pnpm exec oxlint <paths> (add --fix for require-readable-spacing).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArgs, repoRoot } from './lib.mjs';

export const BASELINE_PATH = 'tooling/oxlint/anti-slop-baseline.json';

const LINTED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const require = createRequire(import.meta.url);

/** `anti-slop(no-runtime-typeof)` → `anti-slop/no-runtime-typeof`, the name .oxlintrc.json uses. */
export function ruleName(code) {
  const match = /^([\w-]+)\((.+)\)$/.exec(code);

  return match ? `${match[1]}/${match[2]}` : code;
}

/** Findings per file and rule, plus the diagnostics that are not findings (a file Oxlint could not read or parse). */
export function countFindings(diagnostics) {
  const counts = {};
  const failures = [];

  for (const d of diagnostics) {
    if (!d.code || !d.filename) {
      failures.push(d.message);
      continue;
    }

    const file = d.filename.replaceAll('\\', '/');
    const rule = ruleName(d.code);

    counts[file] ??= {};
    counts[file][rule] = (counts[file][rule] ?? 0) + 1;
  }

  return { counts, failures };
}

/** `added`: a file and rule with more findings than the baseline allows. `gone`: baseline counts above the findings left. */
export function compareWithBaseline(baseline, counts, files) {
  const added = [];
  const gone = [];
  const inScope = (file) => !files || files.includes(file);

  for (const [file, rules] of Object.entries(counts)) {
    for (const [rule, count] of Object.entries(rules)) {
      const allowed = baseline[file]?.[rule] ?? 0;

      if (count > allowed) added.push({ file, rule, count, allowed });
    }
  }

  for (const [file, rules] of Object.entries(baseline)) {
    if (!inScope(file)) continue;

    for (const [rule, allowed] of Object.entries(rules)) {
      const count = counts[file]?.[rule] ?? 0;

      if (count < allowed) gone.push({ file, rule, count, allowed });
    }
  }

  return { added, gone };
}

/** The baseline with every count lowered to the findings that remain; nothing is added or raised. */
export function pruneBaseline(baseline, counts) {
  const pruned = {};

  for (const [file, rules] of Object.entries(baseline)) {
    for (const [rule, allowed] of Object.entries(rules)) {
      const kept = Math.min(allowed, counts[file]?.[rule] ?? 0);

      if (kept > 0) {
        pruned[file] ??= {};
        pruned[file][rule] = kept;
      }
    }
  }

  return pruned;
}

/** Sorted, two-space JSON (what Prettier writes for it), so the file diffs one line per file and rule. */
export function serializeBaseline(counts) {
  const sorted = {};

  for (const file of Object.keys(counts).sort()) {
    sorted[file] = {};

    for (const rule of Object.keys(counts[file]).sort()) sorted[file][rule] = counts[file][rule];
  }

  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function totalFindings(counts) {
  return Object.values(counts)
    .flatMap((rules) => Object.values(rules))
    .reduce((sum, n) => sum + n, 0);
}

function runOxlint(paths) {
  const bin = path.join(path.dirname(require.resolve('oxlint/package.json', { paths: [repoRoot] })), 'bin', 'oxlint');
  const result = spawnSync(process.execPath, [bin, '--format', 'json', ...paths], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });

  if (result.error) throw result.error;

  // 0: no findings, 1: findings. Anything else is a configuration or plugin error.
  if (result.status !== 0 && result.status !== 1) throw new Error(`oxlint exited with ${result.status}:\n${result.stderr}${result.stdout}`);

  try {
    return JSON.parse(result.stdout).diagnostics;
  } catch {
    throw new Error(`oxlint printed no JSON report:\n${result.stderr}${result.stdout}`);
  }
}

function readBaseline() {
  const file = path.join(repoRoot, BASELINE_PATH);

  if (!fs.existsSync(file)) throw new Error(`${BASELINE_PATH} is missing. The owner creates it with \`pnpm lint:anti-slop --rebaseline\`.`);

  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeBaseline(counts) {
  fs.writeFileSync(path.join(repoRoot, BASELINE_PATH), serializeBaseline(counts));
}

function formatDiagnostic(d) {
  const span = d.labels?.[0]?.span;

  return `    ${d.filename}${span ? `:${span.line}:${span.column}` : ''}  ${d.message}`;
}

/** The report for findings above the baseline: every finding of that rule in that file, since counts cannot say which is new. */
function reportAdded(added, diagnostics) {
  const lines = [`anti-slop: ${added.length} file/rule pair(s) have more findings than ${BASELINE_PATH} allows. Fix the new code; never raise the baseline.`];

  for (const a of added) {
    lines.push('', `  ${a.file}  ${a.rule}: ${a.count} finding(s), baseline allows ${a.allowed}`);

    for (const d of diagnostics) {
      if (d.code && d.filename?.replaceAll('\\', '/') === a.file && ruleName(d.code) === a.rule) lines.push(formatDiagnostic(d));
    }
  }

  if (added.some((a) => a.rule === 'anti-slop/require-readable-spacing')) lines.push('', 'require-readable-spacing fixes itself: pnpm exec oxlint --fix <file>, then pnpm lint:anti-slop --prune.');

  return lines.join('\n');
}

function check(diagnostics, baseline, files) {
  const { counts, failures } = countFindings(diagnostics);
  const { added, gone } = compareWithBaseline(baseline, counts, files);
  const problems = [];

  if (failures.length > 0) problems.push(`anti-slop: Oxlint could not check ${failures.length} file(s); save them as UTF-8 and fix any syntax error:\n${failures.map((m) => `  ${m}`).join('\n')}`);

  if (added.length > 0) problems.push(reportAdded(added, diagnostics));

  return { counts, gone, problems };
}

function readHookInput() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const filePath = input.tool_input?.file_path;

  if (!filePath) return null;

  const relative = path.relative(repoRoot, path.resolve(input.cwd ?? repoRoot, filePath)).replaceAll('\\', '/');

  if (relative.startsWith('../') || path.isAbsolute(relative) || !LINTED_EXTENSIONS.has(path.extname(relative)) || !fs.existsSync(path.join(repoRoot, relative))) return null;

  return relative;
}

/** Claude Code hook: exit 2 sends the report back to the agent that just edited the file. Tool errors never block an edit. */
function hook() {
  let file;

  try {
    file = readHookInput();
  } catch {
    return 0;
  }

  if (!file) return 0;

  let result;

  try {
    result = check(runOxlint([file]), readBaseline(), [file]);
  } catch (error) {
    console.error(`anti-slop hook skipped: ${error.message}`);

    return 0;
  }

  if (result.problems.length === 0) return 0;

  console.error(result.problems.join('\n\n'));

  return 2;
}

function main() {
  const args = parseArgs(process.argv.slice(2).filter((a) => a !== '--'));
  const unknown = Object.keys(args).filter((k) => !['_', 'prune', 'rebaseline', 'hook'].includes(k));

  if (unknown.length > 0 || args._.length > 0) {
    console.error('Usage: pnpm lint:anti-slop [--prune] [--rebaseline]. Every finding in some files: pnpm exec oxlint <paths>.');

    return 2;
  }

  if (args.hook) return hook();

  const diagnostics = runOxlint([]);

  if (args.rebaseline) {
    const { counts, failures } = countFindings(diagnostics);

    writeBaseline(counts);
    console.log(`anti-slop: wrote ${BASELINE_PATH} with ${totalFindings(counts)} finding(s) in ${Object.keys(counts).length} file(s).`);

    if (failures.length > 0) console.error(`anti-slop: Oxlint could not check:\n${failures.map((m) => `  ${m}`).join('\n')}`);

    return failures.length > 0 ? 1 : 0;
  }

  const baseline = readBaseline();
  const { counts, gone, problems } = check(diagnostics, baseline);

  if (args.prune && gone.length > 0) {
    const pruned = pruneBaseline(baseline, counts);

    writeBaseline(pruned);
    console.log(`anti-slop: ${BASELINE_PATH} lowered from ${totalFindings(baseline)} to ${totalFindings(pruned)} finding(s).`);
  } else if (gone.length > 0) {
    problems.push(
      `anti-slop: ${gone.length} baseline entr${gone.length === 1 ? 'y lists findings' : 'ies list findings'} that are gone (fixed or deleted). Lock the gain in: pnpm lint:anti-slop --prune, and commit ${BASELINE_PATH}.\n${gone
        .slice(0, 20)
        .map((g) => `  ${g.file}  ${g.rule}: ${g.count} left, baseline ${g.allowed}`)
        .join('\n')}${gone.length > 20 ? `\n  … and ${gone.length - 20} more` : ''}`
    );
  }

  if (problems.length > 0) {
    console.error(problems.join('\n\n'));

    return 1;
  }

  console.log(`anti-slop: no new findings (${totalFindings(counts)} older finding(s) in ${Object.keys(counts).length} file(s) left to fix).`);

  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
