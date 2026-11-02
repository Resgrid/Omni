#!/usr/bin/env node
// Exports the web build of APP_VARIANT into apps/omni/dist/<variant> (omni-plan §6.4). Run from apps/omni.
// The same output feeds the Docker image and every Electron OS job.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { stampVariantWebSplash } = require('@resgrid/config-plugins');

const variant = process.env.APP_VARIANT;
if (!variant) {
  console.error('Set APP_VARIANT (responder | unit | ic | dispatch | bigboard).');
  process.exit(1);
}
const outputDir = `dist/${variant}`;
const result = spawnSync('npx', ['expo', 'export', '-p', 'web', '--output-dir', outputDir, '--clear'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
// The splash in public/index.html is shared; the variant's mark, name and colours go in after the export.
const index = stampVariantWebSplash({ variant, distDir: path.resolve(outputDir) });
console.log(`Stamped the ${variant} splash into ${path.relative(process.cwd(), index)}.`);
