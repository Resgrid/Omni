const { resolveUpdateChannel, resolveUpdateFeedUrl, shouldEnableAutoUpdate } = require('../update-feed');

describe('resolveUpdateFeedUrl', () => {
  it('builds <base>/updates/<variant>/<channel>/', () => {
    expect(resolveUpdateFeedUrl('https://downloads.resgrid.com', 'unit', 'production')).toBe('https://downloads.resgrid.com/updates/unit/production/');
    expect(resolveUpdateFeedUrl('https://cdn.example.com/desktop/', 'bigboard', 'internal')).toBe('https://cdn.example.com/desktop/updates/bigboard/internal/');
    expect(resolveUpdateFeedUrl(' https://cdn.example.com// ', 'ic', 'staging')).toBe('https://cdn.example.com/updates/ic/staging/');
  });

  it('is off when no base URL is configured', () => {
    expect(resolveUpdateFeedUrl(undefined, 'unit', 'production')).toBeNull();
    expect(resolveUpdateFeedUrl('', 'unit', 'production')).toBeNull();
    expect(resolveUpdateFeedUrl('   ', 'unit', 'production')).toBeNull();
  });

  it('refuses insecure, malformed or ambiguous feeds', () => {
    expect(() => resolveUpdateFeedUrl('http://downloads.resgrid.com', 'unit', 'production')).toThrow(/https/);
    expect(resolveUpdateFeedUrl('http://localhost:8080', 'unit', 'production')).toBe('http://localhost:8080/updates/unit/production/');
    expect(() => resolveUpdateFeedUrl('not a url', 'unit', 'production')).toThrow(/valid URL/);
    expect(() => resolveUpdateFeedUrl('https://u:p@cdn.example.com', 'unit', 'production')).toThrow();
    expect(() => resolveUpdateFeedUrl('https://cdn.example.com/?sig=1', 'unit', 'production')).toThrow();
    expect(() => resolveUpdateFeedUrl('https://cdn.example.com', 'unit', 'beta')).toThrow(/channel/);
    expect(() => resolveUpdateFeedUrl('https://cdn.example.com', '../unit', 'production')).toThrow(/variant/);
  });
});

describe('resolveUpdateChannel', () => {
  it('defaults to production and validates RELEASE_CHANNEL', () => {
    expect(resolveUpdateChannel({})).toBe('production');
    expect(resolveUpdateChannel({ RELEASE_CHANNEL: 'internal' })).toBe('internal');
    expect(() => resolveUpdateChannel({ RELEASE_CHANNEL: 'latest' })).toThrow();
  });
});

describe('shouldEnableAutoUpdate', () => {
  const feedUrl = 'https://cdn.example.com/updates/unit/production/';

  it('runs only for packaged installs with a feed', () => {
    expect(shouldEnableAutoUpdate({ feedUrl, isPackaged: true, platform: 'win32', env: {} })).toBe(true);
    expect(shouldEnableAutoUpdate({ feedUrl: null, isPackaged: true, platform: 'win32', env: {} })).toBe(false);
    expect(shouldEnableAutoUpdate({ feedUrl, isPackaged: false, platform: 'darwin', env: {} })).toBe(false);
  });

  it('skips the Windows portable build and honours the kill switch', () => {
    expect(shouldEnableAutoUpdate({ feedUrl, isPackaged: true, platform: 'win32', env: { PORTABLE_EXECUTABLE_DIR: 'D:\\apps' } })).toBe(false);
    expect(shouldEnableAutoUpdate({ feedUrl, isPackaged: true, platform: 'linux', env: { RESGRID_DISABLE_AUTO_UPDATE: '1' } })).toBe(false);
  });
});
