// Client environment passed to the app through `extra.env` (read at runtime by @resgrid/core).
// Each value is read from the unprefixed name first (CI uses one GitHub Environment per variant
// with identical secret names, omni-plan D14), then from the variant's legacy prefix
// (RESPOND_, UNIT_, IC_, DISPATCH_, BIGBOARD_) so existing .env files and deployments keep working.

const DEFAULTS = {
  BASE_API_URL: 'https://qaapi.resgrid.dev',
  API_VERSION: 'v4',
  RESGRID_API_URL: '/api/v4',
  CHANNEL_HUB_NAME: 'eventingHub',
  REALTIME_GEO_HUB_NAME: 'geolocationHub',
  CHAT_HUB_NAME: 'chatHub',
  LOGGING_KEY: '',
  APP_KEY: '',
  SENTRY_DSN: '',
  COUNTLY_APP_KEY: '',
  COUNTLY_SERVER_URL: '',
};

// Responder historically used COUNTLY_URL; accept it as an alias.
const ALIASES = { COUNTLY_SERVER_URL: ['COUNTLY_URL'] };

function readValue(name, prefix, env) {
  const candidates = [name, `${prefix}${name}`, ...(ALIASES[name] || []).flatMap((a) => [a, `${prefix}${a}`])];
  for (const key of candidates) {
    const value = env[key];
    if (value !== undefined && value !== '') return value;
  }
  return DEFAULTS[name];
}

/**
 * @param {object} manifest variant manifest
 * @param {string} appEnv development | staging | internal | production
 * @param {Record<string, string | undefined>} env
 */
function buildClientEnv(manifest, appEnv, env = process.env) {
  const prefix = manifest.identity.web.legacyEnvPrefix;
  const out = { APP_ENV: appEnv, APP_VARIANT: manifest.id };
  for (const name of Object.keys(DEFAULTS)) out[name] = readValue(name, prefix, env);
  return out;
}

module.exports = { buildClientEnv, CLIENT_ENV_DEFAULTS: DEFAULTS };
