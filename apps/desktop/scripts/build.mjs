// Packages one variant's desktop app (omni-plan §6.6.4 stage 2: apps/desktop only, no React Native install, plus the
// variant's web export).
//
//   node scripts/build.mjs --variant unit --win            NSIS + portable (signed when certificate env is present)
//   node scripts/build.mjs --variant unit --mac            dmg + zip, x64 and arm64 (notarized when APPLE_* is present)
//   node scripts/build.mjs --variant unit --linux          AppImage + deb + rpm
//   node scripts/build.mjs --variant bigboard --win --dir  unpacked app only (quick local check)
//
// Options: --variant <id> (or APP_VARIANT), --web <dir> (or WEB_EXPORT_DIR; default apps/omni/dist/<variant>), --dir,
// --stage-only (write out/app and out/runtime-modules, then stop).
// Environment: RELEASE_RUN_NUMBER (version <major>.<run>.0), RELEASE_CHANNEL (production | staging | internal),
// UPDATE_BASE_URL (auto-update feed root; updates are off when unset), signing/notarization variables (see
// packaging/builder-config.js), DESKTOP_REQUIRE_SIGNING=1 (fail instead of shipping unsigned).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { runNumberFromEnv } = require('@resgrid/config-plugins');
const { createBuilderConfig, windowsSigning, macNotarize } = require('../packaging/builder-config');
const { resolveUpdateChannel } = require('../src/core/update-feed');
const { DESKTOP_DIR, defaultWebDir, directorySize, stageApp } = require('./lib/prepare-bundle');

const { values } = parseArgs({
  options: {
    variant: { type: 'string' },
    web: { type: 'string' },
    win: { type: 'boolean', default: false },
    mac: { type: 'boolean', default: false },
    linux: { type: 'boolean', default: false },
    dir: { type: 'boolean', default: false },
    'stage-only': { type: 'boolean', default: false },
  },
  strict: true,
});

const variant = values.variant || process.env.APP_VARIANT;
if (!variant) {
  console.error('Usage: node scripts/build.mjs --variant <responder|unit|ic|dispatch|bigboard> [--win] [--mac] [--linux] [--dir] [--web <export dir>]');
  process.exit(1);
}

const runNumber = runNumberFromEnv();
const channel = resolveUpdateChannel();
const webDir = values.web || process.env.WEB_EXPORT_DIR || defaultWebDir(variant);

const bundle = stageApp({ variant, webDir, runNumber, channel, updateBaseUrl: process.env.UPDATE_BASE_URL || null });
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
console.log(`Staged ${variant} ${bundle.config.version} (${channel}) in ${path.relative(DESKTOP_DIR, bundle.appDir)}: web export ${mb(bundle.webBytes)} from ${webDir}`);
console.log(`Runtime modules: ${bundle.modules.length} packages, ${mb(bundle.modulesBytes)} (${bundle.modules.map((m) => `${m.name}@${m.version}`).join(', ')})`);
console.log(`Auto-update feed: ${bundle.config.updateFeedUrl || 'off (UPDATE_BASE_URL unset)'}`);

if (values['stage-only']) {
  // For `APP_VARIANT=<v> npx electron-builder --config electron-builder.config.js` (same staging, same config).
  process.exit(0);
}

const config = createBuilderConfig({ manifest: bundle.manifest, runNumber, channel });
const platforms = { win: values.win, mac: values.mac, linux: values.linux };
if (!platforms.win && !platforms.mac && !platforms.linux) {
  platforms[process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'] = true;
}
if (platforms.win) console.log(`Windows signing: ${windowsSigning(process.env).mode}`);
if (platforms.mac) console.log(`macOS notarization: ${macNotarize(process.env) ? 'on' : 'off (no APPLE_* credentials)'}`);

const builder = require('electron-builder');
const artifacts = await builder.build({
  projectDir: DESKTOP_DIR,
  config,
  publish: 'never',
  dir: values.dir,
  ...(platforms.win ? { win: [] } : {}),
  ...(platforms.mac ? { mac: [] } : {}),
  ...(platforms.linux ? { linux: [] } : {}),
});

const outputDir = config.directories.output;
for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
  if (entry.isDirectory() && /unpacked$|^mac/.test(entry.name)) {
    console.log(`Unpacked: ${entry.name} ${mb(directorySize(path.join(outputDir, entry.name)))}`);
  }
}
for (const file of artifacts) {
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    console.log(`Artifact: ${path.relative(DESKTOP_DIR, file)} ${mb(fs.statSync(file).size)}`);
  }
}
