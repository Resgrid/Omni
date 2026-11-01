const { buildClientEnv, loadVariant } = require('..');

describe('client env', () => {
  const unit = loadVariant('unit');

  it('prefers unprefixed names, then the legacy prefix, then defaults', () => {
    expect(buildClientEnv(unit, 'production', {}).BASE_API_URL).toBe('https://qaapi.resgrid.dev');
    expect(buildClientEnv(unit, 'production', { UNIT_BASE_API_URL: 'https://legacy' }).BASE_API_URL).toBe('https://legacy');
    expect(buildClientEnv(unit, 'production', { UNIT_BASE_API_URL: 'https://legacy', BASE_API_URL: 'https://new' }).BASE_API_URL).toBe('https://new');
  });

  it('accepts Responder COUNTLY_URL as an alias', () => {
    expect(buildClientEnv(loadVariant('responder'), 'production', { RESPOND_COUNTLY_URL: 'https://c' }).COUNTLY_SERVER_URL).toBe('https://c');
  });

  it('tags the variant and environment', () => {
    expect(buildClientEnv(unit, 'staging', {})).toMatchObject({ APP_ENV: 'staging', APP_VARIANT: 'unit' });
  });
});
