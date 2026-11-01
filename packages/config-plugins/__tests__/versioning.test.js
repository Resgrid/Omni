const { computeVariantVersion, runNumberFromEnv, loadAllVariants } = require('..');
const ts = require('../../config/src/versioning');

describe('versioning', () => {
  it('matches the TypeScript implementation for every variant', () => {
    for (const m of loadAllVariants()) {
      for (const run of [0, 1, 57, 9999]) {
        expect(computeVariantVersion(m, run)).toEqual(ts.computeVariantVersion(m, run));
      }
    }
  });

  it('reads RELEASE_RUN_NUMBER and defaults to 0', () => {
    expect(runNumberFromEnv({})).toBe(0);
    expect(runNumberFromEnv({ RELEASE_RUN_NUMBER: '42' })).toBe(42);
    expect(() => runNumberFromEnv({ RELEASE_RUN_NUMBER: '-1' })).toThrow();
    expect(() => runNumberFromEnv({ RELEASE_RUN_NUMBER: 'abc' })).toThrow();
  });
});
