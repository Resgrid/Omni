// Output folders for Playwright runs that overlap in one checkout (several agent sessions running check-all at once).
// Playwright clears outputDir when a run starts and the HTML reporter clears its folder when a run ends, so two runs sharing
// apps/omni/e2e/test-results delete each other's traces mid-run (ENOENT on .playwright-artifacts-*/traces/*.trace).
// Every `test` run registers its pid in e2e/results/.active before it looks at the others: a run that finds no other live run
// takes the default folders, as before; a run that overlaps one writes to e2e/results/run-<pid> through E2E_OUTPUT_DIR
// (playwright.config.ts). The per-run folders sit outside test-results and playwright-report, which the other runs clear.
import fs from 'node:fs';
import path from 'node:path';

import { omniRoot } from './lib.mjs';

export const RESULTS_DIR = path.join(omniRoot, 'e2e', 'results');

/** Whether a process is running (EPERM: it is, under another user). */
export function isRunning(pid) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Registers this run and picks its output folder: `outputDir` is null for the default folders, otherwise this run's own
 * folder; `overlaps` lists the other live runs; `release` removes the registration (call it when the run ends).
 */
export function claimOutputDir({ resultsDir = RESULTS_DIR, pid = process.pid, running = isRunning } = {}) {
  const activeDir = path.join(resultsDir, '.active');
  fs.mkdirSync(activeDir, { recursive: true });
  const entry = path.join(activeDir, String(pid));
  fs.writeFileSync(entry, '');
  const release = () => fs.rmSync(entry, { force: true });

  const overlaps = [];

  for (const name of fs.readdirSync(activeDir)) {
    const other = Number(name);

    if (other === pid || !Number.isInteger(other)) continue;

    // An entry whose process is gone was left by a run that was killed.
    if (running(other)) overlaps.push(other);
    else fs.rmSync(path.join(activeDir, name), { force: true });
  }

  if (overlaps.length > 0) return { outputDir: path.join(resultsDir, `run-${pid}`), overlaps, release };

  // Alone: as Playwright clears test-results, drop the folders of overlapping runs that have ended.
  for (const name of fs.readdirSync(resultsDir)) {
    const match = /^run-(\d+)$/.exec(name);

    if (match && !running(Number(match[1]))) fs.rmSync(path.join(resultsDir, name), { recursive: true, force: true });
  }

  return { outputDir: null, overlaps, release };
}
