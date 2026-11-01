#!/usr/bin/env node
// Exports the web build of APP_VARIANT into apps/omni/dist/<variant> (omni-plan §6.4). Run from apps/omni.
// The same output feeds the Docker image and every Electron OS job.
import { spawnSync } from 'node:child_process';

const variant = process.env.APP_VARIANT;
if (!variant) {
  console.error('Set APP_VARIANT (responder | unit | ic | dispatch | bigboard).');
  process.exit(1);
}
const result = spawnSync('npx', ['expo', 'export', '-p', 'web', '--output-dir', `dist/${variant}`, '--clear'], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
