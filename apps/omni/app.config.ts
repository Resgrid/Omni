import type { ConfigContext, ExpoConfig } from '@expo/config';

// All per-app values come from variants/<APP_VARIANT>/variant.json through @resgrid/config-plugins
// (omni-plan §5.3). Select the app with APP_VARIANT and the environment with APP_ENV.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAppConfig, resolveBuildTarget, runNumberFromEnv } = require('@resgrid/config-plugins');

export default ({ config }: ConfigContext): ExpoConfig => {
  const { variant, appEnv } = resolveBuildTarget(process.env);
  return createAppConfig({
    variant,
    appEnv,
    runNumber: runNumberFromEnv(process.env),
    projectRoot: __dirname,
    env: process.env,
    baseConfig: config,
  });
};
