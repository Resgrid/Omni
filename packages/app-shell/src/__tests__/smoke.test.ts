import { resetActiveVariantForTests } from '@resgrid/config';

describe('@resgrid/app-shell module', () => {
  it('imports without an active variant (the root layout sets it after imports evaluate)', () => {
    resetActiveVariantForTests();
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the point is to evaluate the barrel in isolation.
      expect(() => require('../index')).not.toThrow();
    });
  });
});
