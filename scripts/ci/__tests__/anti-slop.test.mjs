// node --test scripts/ci/__tests__ — scripts/ci/anti-slop.mjs (anti-slop findings ratcheted against a baseline).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { BASELINE_PATH, compareWithBaseline, countFindings, pruneBaseline, ruleName, serializeBaseline, totalFindings } from '../anti-slop.mjs';
import { repoRoot } from '../lib.mjs';

const finding = (filename, code) => ({ filename, code, message: 'm', severity: 'error', labels: [] });

describe('ruleName', () => {
  it('turns Oxlint codes into the names .oxlintrc.json uses', () => {
    assert.equal(ruleName('anti-slop(no-runtime-typeof)'), 'anti-slop/no-runtime-typeof');
    assert.equal(ruleName('oxc(no-accumulating-spread)'), 'oxc/no-accumulating-spread');
  });
});

describe('countFindings', () => {
  it('counts per file and rule, with POSIX paths', () => {
    const { counts, failures } = countFindings([finding('a.ts', 'anti-slop(no-reflect-get)'), finding('a.ts', 'anti-slop(no-reflect-get)'), finding('dir\\b.ts', 'oxc(no-accumulating-spread)')]);

    assert.deepEqual(counts, { 'a.ts': { 'anti-slop/no-reflect-get': 2 }, 'dir/b.ts': { 'oxc/no-accumulating-spread': 1 } });
    assert.deepEqual(failures, []);
  });

  it('keeps diagnostics without a rule apart: Oxlint could not read or parse that file', () => {
    const { counts, failures } = countFindings([{ message: 'Failed to open file x.ts with error "stream did not contain valid UTF-8"', severity: 'error', labels: [] }]);

    assert.deepEqual(counts, {});
    assert.equal(failures.length, 1);
  });
});

describe('compareWithBaseline', () => {
  const baseline = { 'a.ts': { 'anti-slop/no-reflect-get': 2 }, 'gone.ts': { 'anti-slop/no-reflect-apply': 1 } };

  it('passes the findings the baseline allows', () => {
    assert.deepEqual(compareWithBaseline(baseline, { 'a.ts': { 'anti-slop/no-reflect-get': 2 }, 'gone.ts': { 'anti-slop/no-reflect-apply': 1 } }), { added: [], gone: [] });
  });

  it('reports a file that gains a finding, including a new file or rule', () => {
    const { added } = compareWithBaseline(baseline, {
      'a.ts': { 'anti-slop/no-reflect-get': 3, 'anti-slop/no-runtime-typeof': 1 },
      'gone.ts': { 'anti-slop/no-reflect-apply': 1 },
      'new.ts': { 'anti-slop/no-reflect-get': 1 },
    });

    assert.deepEqual(added, [
      { file: 'a.ts', rule: 'anti-slop/no-reflect-get', count: 3, allowed: 2 },
      { file: 'a.ts', rule: 'anti-slop/no-runtime-typeof', count: 1, allowed: 0 },
      { file: 'new.ts', rule: 'anti-slop/no-reflect-get', count: 1, allowed: 0 },
    ]);
  });

  it('reports baseline findings that are gone, so the baseline is lowered', () => {
    const { added, gone } = compareWithBaseline(baseline, { 'a.ts': { 'anti-slop/no-reflect-get': 1 } });

    assert.deepEqual(added, []);
    assert.deepEqual(gone, [
      { file: 'a.ts', rule: 'anti-slop/no-reflect-get', count: 1, allowed: 2 },
      { file: 'gone.ts', rule: 'anti-slop/no-reflect-apply', count: 0, allowed: 1 },
    ]);
  });

  it('checks only the given files when they are listed (the edit hook)', () => {
    assert.deepEqual(compareWithBaseline(baseline, { 'a.ts': { 'anti-slop/no-reflect-get': 2 } }, ['a.ts']), { added: [], gone: [] });
  });
});

describe('pruneBaseline', () => {
  it('lowers counts and drops fixed entries, but never adds or raises one', () => {
    const baseline = { 'a.ts': { 'anti-slop/no-reflect-get': 2, 'anti-slop/no-reflect-apply': 1 }, 'b.ts': { 'anti-slop/no-reflect-get': 1 } };
    const counts = { 'a.ts': { 'anti-slop/no-reflect-get': 5 }, 'c.ts': { 'anti-slop/no-reflect-get': 1 } };

    assert.deepEqual(pruneBaseline(baseline, counts), { 'a.ts': { 'anti-slop/no-reflect-get': 2 } });
  });
});

describe('serializeBaseline', () => {
  it('sorts files and rules so the file diffs one line per entry', () => {
    const text = serializeBaseline({ 'b.ts': { 'z/rule': 1, 'a/rule': 2 }, 'a.ts': { 'm/rule': 3 } });

    assert.equal(text, '{\n  "a.ts": {\n    "m/rule": 3\n  },\n  "b.ts": {\n    "a/rule": 2,\n    "z/rule": 1\n  }\n}\n');
  });
});

describe(BASELINE_PATH, () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(repoRoot, BASELINE_PATH), 'utf8'));

  const configured = JSON.parse(
    fs
      .readFileSync(path.join(repoRoot, '.oxlintrc.json'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
  ).rules;

  it('is in the sorted form the script writes', () => {
    assert.equal(fs.readFileSync(path.join(repoRoot, BASELINE_PATH), 'utf8'), serializeBaseline(baseline));
  });

  it('lists only rules that are on, with positive counts', () => {
    for (const [file, rules] of Object.entries(baseline)) {
      for (const [rule, count] of Object.entries(rules)) {
        assert.ok(configured[rule] && configured[rule] !== 'off', `${file}: ${rule} is not an enabled rule in .oxlintrc.json`);
        assert.ok(Number.isInteger(count) && count > 0, `${file}: ${rule} has count ${count}`);
      }
    }

    assert.ok(totalFindings(baseline) > 0);
  });
});
