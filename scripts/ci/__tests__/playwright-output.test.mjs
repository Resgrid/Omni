// node --test scripts/ci/__tests__ — scripts/ci/playwright-output.mjs (own output folders for overlapping Playwright runs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { claimOutputDir } from '../playwright-output.mjs';

const tempResults = () => fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-output-'));

/** A `running` check that sees only these pids. */
function runningOnly(...pids) {
  return (pid) => pids.includes(pid);
}

describe('claimOutputDir', () => {
  it('gives a run alone the default folders and registers it until released', () => {
    const resultsDir = tempResults();
    const claim = claimOutputDir({ resultsDir, pid: 100, running: runningOnly(100) });

    assert.equal(claim.outputDir, null);
    assert.deepEqual(claim.overlaps, []);
    assert.deepEqual(fs.readdirSync(path.join(resultsDir, '.active')), ['100']);
    claim.release();
    assert.deepEqual(fs.readdirSync(path.join(resultsDir, '.active')), []);
  });

  it('gives a run that overlaps a live one its own folder', () => {
    const resultsDir = tempResults();
    const running = runningOnly(100, 200);
    const first = claimOutputDir({ resultsDir, pid: 100, running });
    const second = claimOutputDir({ resultsDir, pid: 200, running });

    assert.equal(first.outputDir, null);
    assert.equal(second.outputDir, path.join(resultsDir, 'run-200'));
    assert.deepEqual(second.overlaps, [100]);
  });

  it('never gives two runs that register before either looks the default folders', () => {
    const resultsDir = tempResults();
    fs.mkdirSync(path.join(resultsDir, '.active'), { recursive: true });
    fs.writeFileSync(path.join(resultsDir, '.active', '200'), '');
    const first = claimOutputDir({ resultsDir, pid: 100, running: runningOnly(100, 200) });

    assert.equal(first.outputDir, path.join(resultsDir, 'run-100'));
  });

  it('ignores and removes the registration of a run that was killed', () => {
    const resultsDir = tempResults();
    fs.mkdirSync(path.join(resultsDir, '.active'), { recursive: true });
    fs.writeFileSync(path.join(resultsDir, '.active', '300'), '');
    const claim = claimOutputDir({ resultsDir, pid: 100, running: runningOnly(100) });

    assert.equal(claim.outputDir, null);
    assert.deepEqual(fs.readdirSync(path.join(resultsDir, '.active')), ['100']);
  });

  it('clears the folders of ended runs when it takes the default folders, and keeps a live run’s', () => {
    const resultsDir = tempResults();
    fs.writeFileSync(path.join(resultsDir, 'junit.xml'), '');
    fs.mkdirSync(path.join(resultsDir, 'run-300', 'test-results'), { recursive: true });
    fs.mkdirSync(path.join(resultsDir, 'run-400', 'test-results'), { recursive: true });
    // 400 has no registration, but its process still runs: its folder stays.
    claimOutputDir({ resultsDir, pid: 100, running: runningOnly(100, 400) });

    assert.deepEqual(fs.readdirSync(resultsDir).sort(), ['.active', 'junit.xml', 'run-400']);
  });
});
