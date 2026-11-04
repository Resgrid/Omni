#!/usr/bin/env node
// Builds the desktop (Electron) installers of one or more apps for one OS: `pnpm desktop:<mac|linux|windows> <variant>`.
// For each app it exports the web build into apps/omni/dist/<variant> (the `web:export` CI runs, so a package never
// holds a stale export of another environment) and packages it with apps/desktop/scripts/build.mjs into
// apps/desktop/release/<variant>:
//   mac      dmg + zip, x64 and arm64 (notarized when APPLE_* is present); needs a Mac
//   linux    AppImage + deb + rpm
//   windows  NSIS installer + portable exe (signed when certificate env is present)
// Release builds package each OS on that OS; building another OS's installers relies on electron-builder's cross-build
// tools.
//
// Usage: pnpm desktop:<os> <variant> [<variant> ...] [--dir]
//   --dir writes the unpacked app only (quick local check). APP_ENV (default development), BASE_API_URL and the other
//   client values come from the shell, as with every development build; RELEASE_CHANNEL, RELEASE_RUN_NUMBER,
//   UPDATE_BASE_URL and the signing variables as apps/desktop/scripts/build.mjs describes.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { VARIANT_IDS, resolveBuildTarget } = require('@resgrid/config-plugins');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.join(root, 'apps', 'omni');
const desktopRoot = path.join(root, 'apps', 'desktop');

// OS name → apps/desktop/scripts/build.mjs platform flag.
const TARGETS = { mac: 'mac', linux: 'linux', windows: 'win' };

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [os, ...rest] = process.argv.slice(2).filter((arg) => arg !== '--');
const variants = rest.filter((arg) => !arg.startsWith('-'));
const buildArgs = rest.filter((arg) => arg.startsWith('-'));
const usage = `usage: node scripts/build-desktop.mjs <${Object.keys(TARGETS).join('|')}> <${VARIANT_IDS.join('|')}> [more variants] [--dir]`;

if (!Object.hasOwn(TARGETS, os) || !variants.length) fail(usage);

const unknown = variants.filter((variant) => !VARIANT_IDS.includes(variant));

if (unknown.length) fail(`Unknown app: ${unknown.join(', ')}.\n${usage}`);

if (os === 'mac' && process.platform !== 'darwin') fail('macOS desktop builds need a Mac.');

function run(label, args, cwd, env) {
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit' });

  if (result.error) fail(`${label} could not start: ${result.error.message}`);

  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const variant of variants) {
  const env = { ...process.env, APP_VARIANT: variant, EXPO_NO_DOTENV: '1' };

  // The export runs in apps/omni and the packaging in apps/desktop: a relative WEB_EXPORT_DIR must name one folder for both.
  if (env.WEB_EXPORT_DIR) env.WEB_EXPORT_DIR = path.resolve(projectRoot, env.WEB_EXPORT_DIR);

  try {
    env.APP_ENV = resolveBuildTarget(env).appEnv;
  } catch (error) {
    fail(error.message);
  }

  console.log(`Exporting ${variant} (${env.APP_ENV}) for web.`);
  run(`Web export (${variant})`, [path.join(root, 'scripts', 'web-export.mjs')], projectRoot, env);
  console.log(`Packaging ${variant} for ${os}.`);
  run(`Desktop build (${variant})`, [path.join(desktopRoot, 'scripts', 'build.mjs'), '--variant', variant, `--${TARGETS[os]}`, ...buildArgs], desktopRoot, env);
}
