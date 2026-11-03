#!/usr/bin/env node
// Claude Code hooks that make an agent run `pnpm check-all` (scripts/check-all.mjs) before it ends a turn in which it changed
// the checkout, so work that would fail CI goes back to the agent instead of into a PR (.claude/settings.json, AGENTS.md
// › Testing). Each reads the hook input JSON on stdin.
//
// Usage: node scripts/ci/check-all-hook.mjs pre-tool | post-tool | stop
//   pre-tool   PreToolUse (file edits, Bash): notes the checkout before the tool runs
//   post-tool  PostToolUse and PostToolUseFailure (same tools): marks the session as having changed the checkout when the
//              tool changed it. Edits outside the repo and read-only commands leave it unmarked.
//   stop       Stop: when the session changed the checkout since its last check, runs check-all with its output in
//              node_modules/.cache/check-all/last-run.log, one run at a time across sessions. A failure exits 2 with the
//              summary and the end of each failed step, which Claude Code hands back to the agent. A checkout that already
//              passed (check-all records every complete run that passes, hook or not) is not checked again.
// A hook error never blocks the agent: it is printed and the hook exits 0. A checkout without node_modules is left alone.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repoRoot } from './lib.mjs';

const CACHE_DIR = path.join(repoRoot, 'node_modules', '.cache', 'check-all');
const SESSIONS_DIR = path.join(CACHE_DIR, 'sessions');
const PASSED_FILE = path.join(CACHE_DIR, 'passed.txt');
const LOCK_FILE = path.join(CACHE_DIR, 'run.lock');
const LOG_FILE = path.join(CACHE_DIR, 'last-run.log');

// The level the Stop hook runs: 'full' is every CI check; 'quick' leaves out the web exports and Playwright tests.
const HOOK_LEVEL = 'full';
const KEEP_PASSES = 20;
const KEEP_SESSION_FILES_MS = 14 * 24 * 60 * 60 * 1000;
const LOCK_POLL_MS = 5000;
const TAIL_LINES = 40;
const MAX_REPORT_CHARS = 12_000;
const ID = /^[\w-]{1,128}$/;
const PASS_LINE = /^(full|quick) ([0-9a-f]{64})$/;

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, maxBuffer: 1024 ** 3 });

  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr).trim()}`);

  return result.stdout;
}

/** HEAD, every change to tracked files and every untracked file Git does not ignore: what CI would check if it were committed. */
export function checkoutFingerprint(root = repoRoot) {
  const hash = crypto.createHash('sha256');
  hash.update(git(root, ['rev-parse', 'HEAD']));
  hash.update(git(root, ['diff', 'HEAD', '--binary', '--no-ext-diff', '--no-color']));

  const untracked = String(git(root, ['ls-files', '--others', '--exclude-standard', '-z']))
    .split('\0')
    .filter(Boolean)
    .sort();

  for (const file of untracked) {
    hash.update(`\0${file}\0`);

    try {
      hash.update(fs.readFileSync(path.join(root, file)));
    } catch {
      hash.update('\0unreadable\0');
    }
  }

  return hash.digest('hex');
}

/** passed.txt holds one `<level> <fingerprint>` line per passing run, newest first. */
export function parsePasses(text) {
  return text
    .split('\n')
    .map((line) => PASS_LINE.exec(line.trim()))
    .filter(Boolean)
    .map(([, level, fingerprint]) => ({ level, fingerprint }));
}

export function addPass(text, fingerprint, level) {
  const others = parsePasses(text).filter((pass) => pass.fingerprint !== fingerprint || pass.level !== level);

  return [{ level, fingerprint }, ...others]
    .slice(0, KEEP_PASSES)
    .map((pass) => `${pass.level} ${pass.fingerprint}\n`)
    .join('');
}

/** A full pass also covers a quick check. */
export function hasPass(text, fingerprint, level) {
  return parsePasses(text).some((pass) => pass.fingerprint === fingerprint && (pass.level === level || pass.level === 'full'));
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** check-all calls this after a complete run passes, so the Stop hook does not run it again on the same checkout. */
export function recordPass(fingerprint, level) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(PASSED_FILE, addPass(readText(PASSED_FILE), fingerprint, level));
}

/** The summary of a failed run and the end of each failed step's output, sized for the agent's context. */
export function failureReport(log, logPath = LOG_FILE) {
  const [body, summary = ''] = log.split('\n━━ Summary\n');
  const rows = [...summary.matchAll(/^ {2}(pass|FAIL|skip)\s+(\S+)/gm)].filter(([, status]) => status !== 'skip');
  // check-all prints a `━━ <label>` header before each step it runs, so the headers line up with the rows that ran.
  const sections = body.split('\n━━ ').slice(1);

  const tails =
    rows.length === sections.length ? rows.flatMap(([, status, id], i) => (status === 'FAIL' ? [`── ${id}, last ${TAIL_LINES} lines\n${sections[i].trimEnd().split('\n').slice(-TAIL_LINES).join('\n')}`] : [])) : [];

  const head = [
    'pnpm check-all failed on this checkout, so CI would fail too. Fix what your work caused, then finish again: the check runs again.',
    "A failure in files you did not touch is another session's work in progress: report it, don't fix it (AGENTS.md).",
    `Full output: ${path.relative(repoRoot, logPath)}`,
    '',
    summary.replace(/^\n+/, '').trimEnd(),
  ].join('\n');

  const report = [head, ...tails].join('\n\n');

  return report.length > MAX_REPORT_CHARS ? `${report.slice(0, MAX_REPORT_CHARS)}\n… (cut; the rest is in the log)` : report;
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** One check-all at a time: two web exports of the same variant would write over each other. */
function withLock(work) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  for (;;) {
    try {
      fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    const holder = readText(LOCK_FILE);

    // An empty lock is one being written right now.
    if (holder !== '' && !isAlive(Number(holder))) fs.rmSync(LOCK_FILE, { force: true });
    else sleep(LOCK_POLL_MS);
  }

  try {
    return work();
  } finally {
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

function sessionFile(sessionId, name) {
  return path.join(SESSIONS_DIR, `${sessionId}.${name}`);
}

function pruneSessionFiles() {
  const cutoff = Date.now() - KEEP_SESSION_FILES_MS;

  for (const entry of fs.existsSync(SESSIONS_DIR) ? fs.readdirSync(SESSIONS_DIR) : []) {
    const file = path.join(SESSIONS_DIR, entry);

    if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true });
  }
}

function preTool(sessionId, toolUseId) {
  if (toolUseId === null) return 0;

  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(sessionFile(sessionId, `${toolUseId}.before`), checkoutFingerprint());

  return 0;
}

function postTool(sessionId, toolUseId) {
  const beforeFile = toolUseId === null ? null : sessionFile(sessionId, `${toolUseId}.before`);
  const before = beforeFile === null ? '' : readText(beforeFile);

  if (beforeFile !== null) fs.rmSync(beforeFile, { force: true });

  // Without a note from pre-tool, count the tool as a change.
  if (before === '' || before !== checkoutFingerprint()) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    fs.writeFileSync(sessionFile(sessionId, 'changed'), '');
  }

  return 0;
}

function runCheckAll() {
  const log = fs.openSync(LOG_FILE, 'w');

  try {
    const args = HOOK_LEVEL === 'quick' ? ['--quick'] : [];

    return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'check-all.mjs'), ...args], { cwd: repoRoot, stdio: ['ignore', log, log] }).status;
  } finally {
    fs.closeSync(log);
  }
}

function stop(sessionId) {
  pruneSessionFiles();
  const changedFile = sessionFile(sessionId, 'changed');

  if (!fs.existsSync(changedFile)) return 0;

  return withLock(() => {
    const status = hasPass(readText(PASSED_FILE), checkoutFingerprint(), HOOK_LEVEL) ? 0 : runCheckAll();

    // Cleared only once check-all has finished: a run cut short (the turn was stopped) runs again at the next stop.
    fs.rmSync(changedFile, { force: true });

    if (status === 0) return 0;

    console.error(failureReport(readText(LOG_FILE)));

    return 2;
  });
}

function main() {
  const event = process.argv[2];

  if (!['pre-tool', 'post-tool', 'stop'].includes(event)) {
    console.error('Usage: node scripts/ci/check-all-hook.mjs pre-tool | post-tool | stop (Claude Code hook input on stdin)');

    return 0;
  }

  // A checkout without `pnpm install` (a fresh worktree) cannot run check-all; the hooks stay out of its way.
  if (!fs.existsSync(path.join(repoRoot, 'node_modules', '.modules.yaml'))) return 0;

  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const sessionId = String(input.session_id ?? '');
  const toolUseId = ID.test(String(input.tool_use_id ?? '')) ? String(input.tool_use_id) : null;

  if (!ID.test(sessionId)) throw new Error('the hook input has no session_id');

  if (event === 'pre-tool') return preTool(sessionId, toolUseId);

  if (event === 'post-tool') return postTool(sessionId, toolUseId);

  return stop(sessionId);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`check-all hook skipped: ${error.message}`);
    process.exitCode = 0;
  }
}
