#!/usr/bin/env node
// Runs the Playwright CLI for the acceptance suites in apps/omni/e2e (web and Electron).
// Uses the workspace's @playwright/test when it is installed. Until it is a root devDependency, or in jobs
// that skip the full install (the Electron jobs install only apps/desktop), it installs the pinned version into
// a folder outside the repository and exposes it through NODE_PATH; the e2e config and tests then resolve
// `@playwright/test` from there (apps/omni is CommonJS, so NODE_PATH applies).
//
// Usage: node scripts/ci/run-playwright.mjs <playwright args>
//   node scripts/ci/run-playwright.mjs install --with-deps chromium
//   node scripts/ci/run-playwright.mjs test -c apps/omni/e2e/playwright.config.ts --project web-unit
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { omniRoot, repoRoot } from './lib.mjs';

// Keep in step with the root devDependency once added (docs/build/ci-secrets.md lists it as a follow-up).
const PLAYWRIGHT_VERSION = process.env.PLAYWRIGHT_VERSION || '1.64.1';
const require = createRequire(import.meta.url);

function resolveWorkspace() {
  try {
    return require.resolve('@playwright/test/package.json', { paths: [omniRoot, repoRoot] });
  } catch {
    return null;
  }
}

let pkgJson = resolveWorkspace();
let nodePath = null;
if (!pkgJson) {
  const dir = process.env.PLAYWRIGHT_FALLBACK_DIR || path.join(process.env.RUNNER_TEMP || os.tmpdir(), `resgrid-playwright-${PLAYWRIGHT_VERSION}`);
  const marker = path.join(dir, 'node_modules', '@playwright', 'test', 'package.json');
  if (!fs.existsSync(marker)) {
    console.error(`@playwright/test is not installed in the workspace; installing ${PLAYWRIGHT_VERSION} into ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path.join(dir, 'package.json'))) fs.writeFileSync(path.join(dir, 'package.json'), '{ "private": true }\n');
    const npm = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', `@playwright/test@${PLAYWRIGHT_VERSION}`], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
    if (npm.status !== 0) process.exit(npm.status ?? 1);
  }
  pkgJson = marker;
  nodePath = path.join(dir, 'node_modules');
}

const cli = path.join(path.dirname(pkgJson), 'cli.js');
const env = { ...process.env };
if (nodePath) env.NODE_PATH = [nodePath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { cwd: repoRoot, stdio: 'inherit', env });
process.exit(result.status ?? 1);
