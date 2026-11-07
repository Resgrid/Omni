#!/usr/bin/env node
// Exports the web build of APP_VARIANT into apps/omni/dist/<variant> (omni-plan §6.4). Run from apps/omni.
// The same output feeds the Docker image and every Electron OS job. WEB_EXPORT_DIR writes it elsewhere instead (the QA
// regression run keeps its own copy, which a parallel export cannot replace mid-run).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { stampVariantServiceWorker, stampVariantWebSplash } = require('@resgrid/config-plugins');

const variant = process.env.APP_VARIANT;

if (!variant) {
  console.error('Set APP_VARIANT (responder | unit | ic | dispatch | bigboard).');
  process.exit(1);
}

const outputDir = process.env.WEB_EXPORT_DIR || `dist/${variant}`;
const result = spawnSync('npx', ['expo', 'export', '-p', 'web', '--output-dir', outputDir, '--clear'], { stdio: 'inherit', shell: process.platform === 'win32' });

if (result.status !== 0) {
  // spawnSync does not throw: a command that never started reports here, with no output of its own.
  if (result.error) console.error(`expo export (${variant}) could not start: ${result.error.message}`);
  process.exit(result.status ?? 1);
}

// The splash in public/index.html is shared; the variant's mark, name and colours go in after the export.
const index = stampVariantWebSplash({ variant, distDir: path.resolve(outputDir) });

console.log(`Stamped the ${variant} splash into ${path.relative(process.cwd(), index)}.`);

// The push service worker (public/service-worker.js) is shared too; its fallback title is the app's name.
const serviceWorker = stampVariantServiceWorker({ variant, distDir: path.resolve(outputDir) });

console.log(`Stamped the ${variant} name into ${path.relative(process.cwd(), serviceWorker)}.`);
