#!/usr/bin/env node
// Runs the Maestro flows of one variant (apps/omni/e2e/maestro/<variant>/) against an installed build.
// The app id always comes from the variant manifest — never hard-coded in flows (the legacy repos shipped a stale
// `com.obytes.development`): iOS bundle id or Android package, with the `.<APP_ENV>` suffix that app.config adds
// outside production/internal (dev-client and simulator builds are `.development`).
//
// Usage:
//   node apps/omni/e2e/maestro/run-maestro.mjs --variant unit --platform android [--app-env development]
//        [--dev-client-url http://localhost:8081] [--device emulator-5554] [--output apps/omni/e2e/maestro-output/unit]
//        [--dry-run] [-- <extra maestro test args>]
// With --dev-client-url the flows open the Metro bundle through the dev-client deep link (exp+<slug>://…).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const omniRoot = path.resolve(here, '..', '..');
const VARIANTS = ['responder', 'unit', 'ic', 'dispatch', 'bigboard'];
const STORE_ENVS = ['production', 'internal'];

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const own = sep >= 0 ? argv.slice(0, sep) : argv;
const extra = sep >= 0 ? argv.slice(sep + 1) : [];
const opt = (name, fallback) => {
  const i = own.indexOf(`--${name}`);
  return i >= 0 && own[i + 1] && !own[i + 1].startsWith('--') ? own[i + 1] : fallback;
};
const flag = (name) => own.includes(`--${name}`);

const variant = opt('variant', process.env.APP_VARIANT);
const platform = opt('platform', 'android');
const appEnv = opt('app-env', 'development');
const devClientUrl = opt('dev-client-url', '');
const device = opt('device', '');
const output = path.resolve(opt('output', path.join(omniRoot, 'e2e', 'maestro-output', variant ?? 'unknown')));

if (!VARIANTS.includes(variant)) fail(`--variant must be one of ${VARIANTS.join(', ')}`);
if (!['android', 'ios'].includes(platform)) fail('--platform must be android or ios');

const manifest = JSON.parse(fs.readFileSync(path.join(omniRoot, 'variants', variant, 'variant.json'), 'utf8'));
const baseId = platform === 'ios' ? manifest.identity.ios.bundleIdentifier : manifest.identity.android.package;
const appId = STORE_ENVS.includes(appEnv) ? baseId : `${baseId}.${appEnv}`;
const devClientLink = devClientUrl ? `exp+${manifest.identity.slug}://expo-development-client/?url=${encodeURIComponent(devClientUrl)}` : 'none';
const flowsDir = path.join(here, variant);

const env = { APP_ID: appId, APP_NAME: manifest.identity.name, APP_VARIANT: variant, DEV_CLIENT_URL: devClientUrl || 'none', DEV_CLIENT_LINK: devClientLink };
const args = ['test', flowsDir, ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), '--format', 'junit', '--output', path.join(output, 'junit.xml'), ...(device ? ['--device', device] : []), ...extra];

console.log(`Maestro: ${variant} on ${platform} (${appEnv}) → appId ${appId}`);
console.log(`maestro ${args.join(' ')}`);
if (flag('dry-run')) process.exit(0);

fs.mkdirSync(output, { recursive: true });
// takeScreenshot writes relative to the working directory, so screenshots land next to the report.
// Windows installs maestro as a .bat, which needs a shell; quote arguments that contain spaces (APP_NAME).
const win = process.platform === 'win32';
const result = spawnSync('maestro', win ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args, { cwd: output, stdio: 'inherit', shell: win });
if (result.error) fail(`could not start maestro (${result.error.message}). Install it: https://maestro.mobile.dev`);
process.exit(result.status ?? 1);

function fail(message) {
  console.error(`run-maestro: ${message}`);
  process.exit(2);
}
