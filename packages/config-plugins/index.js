// @resgrid/config-plugins — build-time code shared by apps/omni/app.config.ts, CI scripts,
// apps/desktop and docker. Plain CommonJS on purpose: Expo's config loader and Node scripts
// can require it without a TypeScript transform.
module.exports = {
  ...require('./src/app-config'),
  ...require('./src/client-env'),
  ...require('./src/variants'),
  ...require('./src/versioning'),
};
