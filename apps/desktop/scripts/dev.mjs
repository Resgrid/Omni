// Runs the desktop shell unpackaged for one variant.
//
//   node scripts/dev.mjs --variant unit                      against the Expo web dev server (http://localhost:8081)
//   node scripts/dev.mjs --variant unit --url http://localhost:8082
//   node scripts/dev.mjs --variant bigboard --export         against apps/omni/dist/bigboard through app:// (or loopback)
//   node scripts/dev.mjs --variant bigboard --web <dir>      against another export
//
// Start the dev server first: `cd apps/omni && APP_VARIANT=unit npx expo start --web`. The run uses its own staging folder
// (out/dev-bundle/) and its own profile folder (<userDataDir>-dev), so it never touches an installed app or a packaging run.
// RESGRID_DESKTOP_APPDATA_DIR moves that profile folder elsewhere (unpackaged runs only).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { DESKTOP_DIR, defaultWebDir, prepareBundle } = require('./lib/prepare-bundle');

const { values } = parseArgs({
  options: {
    variant: { type: 'string' },
    url: { type: 'string' },
    web: { type: 'string' },
    export: { type: 'boolean', default: false },
    'register-protocol': { type: 'boolean', default: false },
  },
  strict: true,
});

const variant = values.variant || process.env.APP_VARIANT || 'unit';
const useExport = values.export || Boolean(values.web);
const bundleDir = path.join(DESKTOP_DIR, 'out', 'dev-bundle');
const webDir = useExport ? values.web || defaultWebDir(variant) : null;

const { config } = prepareBundle({ variant, bundleDir, webDir });
const devUrl = useExport ? null : values.url || 'http://localhost:8081';
console.log(`${config.productName}: ${devUrl ? `dev server ${devUrl}` : `export ${webDir}`}`);

const env = { ...process.env, RESGRID_DESKTOP_BUNDLE_DIR: bundleDir, ...(devUrl ? { RESGRID_DESKTOP_DEV_URL: devUrl } : {}) };
delete env.ELECTRON_RUN_AS_NODE;
if (!devUrl) delete env.RESGRID_DESKTOP_DEV_URL;
if (values['register-protocol']) env.RESGRID_DESKTOP_REGISTER_PROTOCOL = '1';

// The electron package exports the path of its binary when required from Node.
const electronBinary = require('electron');
const child = spawn(electronBinary, [DESKTOP_DIR], { stdio: 'inherit', env });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
