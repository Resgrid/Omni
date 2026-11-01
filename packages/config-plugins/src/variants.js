// Loads variant manifests for build-time code (app.config.ts, CI scripts, Electron, Docker).
// Runtime code imports the same JSON through @resgrid/config. Validation here is deliberately
// light — the full zod schema runs in the @resgrid/config test suite and in `pnpm variants:check`.
const fs = require('fs');
const path = require('path');

const VARIANT_IDS = ['responder', 'unit', 'ic', 'dispatch', 'bigboard'];
const APP_ENVS = ['development', 'staging', 'internal', 'production'];

const variantsDir = path.resolve(__dirname, '..', '..', '..', 'apps', 'omni', 'variants');

function assertVariantId(id) {
  if (!VARIANT_IDS.includes(id)) {
    throw new Error(`Unknown APP_VARIANT "${id}". Expected one of: ${VARIANT_IDS.join(', ')}.`);
  }
  return id;
}

function assertAppEnv(env) {
  if (!APP_ENVS.includes(env)) {
    throw new Error(`Unknown APP_ENV "${env}". Expected one of: ${APP_ENVS.join(', ')}.`);
  }
  return env;
}

function loadVariant(id) {
  assertVariantId(id);
  const file = path.join(variantsDir, id, 'variant.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (manifest.id !== id) throw new Error(`${file}: id "${manifest.id}" does not match folder "${id}".`);
  for (const key of ['identity', 'storage', 'versioning', 'capabilities', 'native', 'shell']) {
    if (!manifest[key]) throw new Error(`${file}: missing "${key}".`);
  }
  return manifest;
}

function loadAllVariants() {
  return VARIANT_IDS.map(loadVariant);
}

/** `APP_VARIANT` / `APP_ENV` from the environment, validated. */
function resolveBuildTarget(env = process.env) {
  const variant = assertVariantId(env.APP_VARIANT || 'unit');
  const appEnv = assertAppEnv(env.APP_ENV || 'development');
  return { variant, appEnv };
}

module.exports = { VARIANT_IDS, APP_ENVS, variantsDir, loadVariant, loadAllVariants, resolveBuildTarget, assertVariantId, assertAppEnv };
