import { Env, filterRuntimeEnv, getAppVersionInfo, getEnv, mergeClientEnv, resetEnvForTests } from '../env';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));

const mockPlatform = jest.requireMock('react-native').Platform as { OS: string };
const mockExpoConfig = (jest.requireMock('expo-constants').default as { expoConfig: { extra?: Record<string, unknown>; version?: string } }).expoConfig;

const buildEnv = {
  APP_ENV: 'staging',
  APP_VARIANT: 'dispatch',
  BASE_API_URL: 'https://build.example.com',
  API_VERSION: 'v4',
  RESGRID_API_URL: '/api/v4',
  CHANNEL_HUB_NAME: 'eventingHub',
  REALTIME_GEO_HUB_NAME: 'geolocationHub',
  CHAT_HUB_NAME: 'chatHub',
  LOGGING_KEY: '',
  APP_KEY: 'build-app-key',
  SENTRY_DSN: 'https://dsn@build',
  COUNTLY_APP_KEY: 'countly-build',
  COUNTLY_SERVER_URL: 'https://countly.build',
};

describe('filterRuntimeEnv', () => {
  it('drops unsubstituted ${...} placeholders and empty values (BigBoard env-config.js)', () => {
    expect(
      filterRuntimeEnv({
        BASE_API_URL: '${BIGBOARD_BASE_API_URL}',
        SENTRY_DSN: '',
        APP_KEY: '   ',
        COUNTLY_APP_KEY: 'runtime-key',
        MAINTENANCE_MODE: 'true',
        EXTRA: undefined,
      })
    ).toEqual({ COUNTLY_APP_KEY: 'runtime-key', MAINTENANCE_MODE: 'true' });
  });

  it('returns an empty object for anything that is not a plain object', () => {
    expect(filterRuntimeEnv(undefined)).toEqual({});
    expect(filterRuntimeEnv('nope')).toEqual({});
    expect(filterRuntimeEnv(['a'])).toEqual({});
  });
});

describe('mergeClientEnv', () => {
  it('lets web runtime values override build values (Dispatch) but ignores placeholders', () => {
    const env = mergeClientEnv(buildEnv, { BASE_API_URL: 'https://runtime.example.com', SENTRY_DSN: '${DISPATCH_SENTRY_DSN}', MAINTENANCE_MODE: true }, 'web');
    expect(env.BASE_API_URL).toBe('https://runtime.example.com');
    expect(env.SENTRY_DSN).toBe('https://dsn@build');
    expect(env.MAINTENANCE_MODE).toBe(true);
    expect(env.APP_KEY).toBe('build-app-key');
  });

  it('ignores window.__ENV__ on native', () => {
    const env = mergeClientEnv(buildEnv, { BASE_API_URL: 'https://runtime.example.com' }, 'ios');
    expect(env.BASE_API_URL).toBe('https://build.example.com');
  });

  it('derives IS_MOBILE_APP from the platform: true on iOS/Android, false on web even if a deployment says otherwise', () => {
    expect(mergeClientEnv(buildEnv, undefined, 'ios').IS_MOBILE_APP).toBe(true);
    expect(mergeClientEnv(buildEnv, undefined, 'android').IS_MOBILE_APP).toBe(true);
    expect(mergeClientEnv({ ...buildEnv, IS_MOBILE_APP: 'true' }, { IS_MOBILE_APP: true }, 'web').IS_MOBILE_APP).toBe(false);
  });

  it('coerces MAINTENANCE_MODE strings to booleans', () => {
    expect(mergeClientEnv(buildEnv, { MAINTENANCE_MODE: 'TRUE' }, 'web').MAINTENANCE_MODE).toBe(true);
    expect(mergeClientEnv(buildEnv, { MAINTENANCE_MODE: 'false' }, 'web').MAINTENANCE_MODE).toBe(false);
    expect(mergeClientEnv(buildEnv, {}, 'web').MAINTENANCE_MODE).toBe(false);
  });

  it('falls back to defaults for missing keys and to production for an unknown APP_ENV outside development', () => {
    const env = mergeClientEnv({ APP_ENV: 'qa' }, undefined, 'android');
    expect(env.APP_ENV).toBe('production');
    expect(env.BASE_API_URL).toBe('https://qaapi.resgrid.dev');
    expect(env.CHANNEL_HUB_NAME).toBe('eventingHub');
    expect(env.SENTRY_DSN).toBe('');
  });

  it('keeps a valid APP_ENV', () => {
    expect(mergeClientEnv(buildEnv, undefined, 'ios').APP_ENV).toBe('staging');
  });
});

describe('getEnv / Env', () => {
  afterEach(() => {
    resetEnvForTests();
    mockPlatform.OS = 'ios';
    delete (globalThis as { window?: unknown }).window;
    delete mockExpoConfig.extra;
    delete mockExpoConfig.version;
  });

  it('reads extra.env from the Expo config', () => {
    mockExpoConfig.extra = { env: buildEnv };
    expect(getEnv().APP_KEY).toBe('build-app-key');
    expect(Env.SENTRY_DSN).toBe('https://dsn@build');
    expect(Env.IS_MOBILE_APP).toBe(true);
  });

  it('merges window.__ENV__ on web', () => {
    mockPlatform.OS = 'web';
    mockExpoConfig.extra = { env: buildEnv };
    (globalThis as { window?: unknown }).window = { __ENV__: { COUNTLY_SERVER_URL: 'https://countly.runtime', APP_KEY: '${DISPATCH_APP_KEY}' } };
    expect(getEnv().COUNTLY_SERVER_URL).toBe('https://countly.runtime');
    expect(getEnv().APP_KEY).toBe('build-app-key');
    expect(getEnv().IS_MOBILE_APP).toBe(false);
  });

  it('caches the merged env until reset', () => {
    mockExpoConfig.extra = { env: buildEnv };
    const first = getEnv();
    mockExpoConfig.extra = { env: { ...buildEnv, APP_KEY: 'changed' } };
    expect(getEnv()).toBe(first);
    resetEnvForTests();
    expect(getEnv().APP_KEY).toBe('changed');
  });

  it('reads version info from extra.version, falling back to the config version', () => {
    mockExpoConfig.extra = { version: { version: '8.12', buildNumber: 10012, electronVersion: '8.12.0', tag: 'unit-v8.12' } };
    expect(getAppVersionInfo()).toEqual({ version: '8.12', buildNumber: 10012, electronVersion: '8.12.0', tag: 'unit-v8.12' });
    mockExpoConfig.extra = {};
    mockExpoConfig.version = '8.0';
    expect(getAppVersionInfo()).toEqual({ version: '8.0', buildNumber: 0 });
  });
});
