import fs from 'node:fs';
import path from 'node:path';

import type { VariantManifest } from '@resgrid/config';

import { flagsOf, type NavRegistry } from '../nav/define-nav';

// The QA regression suite (apps/omni/e2e/qa) checks flag-gated navigation in the seeded flags-on and flags-off
// departments without loading app code, from e2e/support/flag-gated-nav.json. This keeps that table equal to what each
// app's nav.ts gates on feature flags (visible entries whose capability the app has). Here rather than in apps/omni
// because loading nav.ts needs this package's React Native preset.
// nav.ts reaches the sign-in screens' language list, which needs the real language constants (jest.setup mocks i18n).
jest.mock('@resgrid/i18n', () => jest.requireActual('@resgrid/i18n'));

const OMNI = path.resolve(__dirname, '..', '..', '..', '..', 'apps', 'omni');
const TABLE = path.join(OMNI, 'e2e', 'support', 'flag-gated-nav.json');
const VARIANTS = ['responder', 'unit', 'ic', 'dispatch', 'bigboard'];

const loadNav = (variant: string): NavRegistry => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module: { nav: NavRegistry } = require(path.join(OMNI, 'variants', variant, 'nav'));

  return module.nav;
};

const loadManifest = (variant: string): VariantManifest => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module: { default: VariantManifest } = require(path.join(OMNI, 'variants', variant, 'variant'));

  return module.default;
};

describe('QA regression flag-gated navigation table', () => {
  it('lists every visible nav entry each app shows only while its flags are on', () => {
    const computed = Object.fromEntries(
      VARIANTS.map((variant) => {
        const capabilities = loadManifest(variant).capabilities;

        const gated = loadNav(variant)
          .entries.filter((entry) => entry.placement !== 'hidden' && flagsOf(entry).length > 0)
          .filter((entry) => !entry.requiresCapability || entry.requiresCapability(capabilities))
          .map((entry) => ({ id: entry.id, flags: [...flagsOf(entry)] }));

        return [variant, gated];
      })
    );

    const table: unknown = JSON.parse(fs.readFileSync(TABLE, 'utf8'));

    expect(table).toEqual(computed);
  });
});
