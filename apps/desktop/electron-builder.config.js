'use strict';
// electron-builder CLI entry. scripts/build.mjs is the usual way in; for the CLI, stage first with the same variables:
//   node scripts/build.mjs --variant unit --stage-only     (out/app: shell + web export + variant-config; out/runtime-modules)
//   APP_VARIANT=unit npx electron-builder --config electron-builder.config.js --win
// Both use the same generator, packaging/builder-config.js. Environment: APP_VARIANT, RELEASE_RUN_NUMBER, RELEASE_CHANNEL, UPDATE_BASE_URL,
// and the signing/notarization variables documented there.

const { loadVariant, runNumberFromEnv } = require('@resgrid/config-plugins');

const { createBuilderConfig } = require('./packaging/builder-config');
const { resolveUpdateChannel } = require('./src/core/update-feed');

if (!process.env.APP_VARIANT) {
  throw new Error('APP_VARIANT is required (responder, unit, ic, dispatch or bigboard).');
}

module.exports = createBuilderConfig({
  manifest: loadVariant(process.env.APP_VARIANT),
  runNumber: runNumberFromEnv(),
  channel: resolveUpdateChannel(),
});
