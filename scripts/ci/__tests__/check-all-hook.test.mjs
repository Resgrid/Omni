// node --test scripts/ci/__tests__ — scripts/ci/check-all-hook.mjs (Claude Code hooks that run check-all before an agent finishes).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { addPass, checkoutFingerprint, failureReport, hasPass, parsePasses } from '../check-all-hook.mjs';

const fp = (c) => c.repeat(64);

describe('passes', () => {
  it('keeps the newest pass first, once per checkout and level', () => {
    let text = addPass('', fp('a'), 'quick');
    text = addPass(text, fp('b'), 'full');
    text = addPass(text, fp('a'), 'quick');

    assert.deepEqual(parsePasses(text), [
      { level: 'quick', fingerprint: fp('a') },
      { level: 'full', fingerprint: fp('b') },
    ]);
  });

  it('counts a full pass for a quick check, not the other way round', () => {
    const text = addPass(addPass('', fp('a'), 'full'), fp('b'), 'quick');

    assert.equal(hasPass(text, fp('a'), 'quick'), true);
    assert.equal(hasPass(text, fp('b'), 'full'), false);
    assert.equal(hasPass(text, fp('c'), 'quick'), false);
  });

  it('ignores lines it does not understand', () => {
    assert.deepEqual(parsePasses(`full ${fp('a')}\nnonsense\nfull short\n`), [{ level: 'full', fingerprint: fp('a') }]);
  });
});

describe('checkoutFingerprint', () => {
  it('changes with tracked edits and untracked files, not with ignored files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-all-hook-'));
    const git = (...args) => assert.equal(spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: root }).status, 0);

    try {
      git('init', '-q');
      fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
      fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\n');
      git('add', '.');
      git('commit', '-q', '-m', 'init');
      const clean = checkoutFingerprint(root);

      fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
      const edited = checkoutFingerprint(root);
      assert.notEqual(edited, clean);

      fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
      assert.equal(checkoutFingerprint(root), clean);

      fs.mkdirSync(path.join(root, 'ignored'));
      fs.writeFileSync(path.join(root, 'ignored', 'x.txt'), 'x\n');
      assert.equal(checkoutFingerprint(root), clean);

      fs.writeFileSync(path.join(root, 'b.txt'), 'new\n');
      const untracked = checkoutFingerprint(root);
      assert.notEqual(untracked, clean);

      fs.writeFileSync(path.join(root, 'b.txt'), 'changed\n');
      assert.notEqual(checkoutFingerprint(root), untracked);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('failureReport', () => {
  const log = [
    '',
    '━━ ESLint: pnpm run lint',
    '',
    'lint ok',
    '',
    '━━ TypeScript: pnpm run type-check',
    '',
    'a.ts(1,1): error TS2345: nope',
    'ELIFECYCLE Command failed with exit code 2.',
    '',
    '━━ Summary',
    '',
    '  pass  lint                   3.0s',
    '  FAIL  type-check             9.0s',
    '  skip  e2e:unit               --skip',
    '',
    '1 passed, 1 failed, 1 skipped in 12.0s',
  ].join('\n');

  it('gives the summary and the end of each failed step', () => {
    const report = failureReport(log, '/repo/node_modules/.cache/check-all/last-run.log');

    assert.match(report, /^ {2}pass {2}lint/m);
    assert.match(report, /^ {2}FAIL {2}type-check/m);
    assert.match(report, /── type-check, last \d+ lines\nTypeScript: pnpm run type-check\n\na\.ts\(1,1\): error TS2345: nope/);
    assert.doesNotMatch(report, /lint ok/);
  });

  it('falls back to the summary when the step headers do not line up', () => {
    const report = failureReport(log.replace('━━ ESLint', 'ESLint'));

    assert.match(report, /FAIL {2}type-check/);
    assert.doesNotMatch(report, /── type-check/);
  });
});
