// node --test scripts/ci/__tests__ — scripts/ci/affected-variants.mjs (which variants app-platforms.yml tests).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { affectedVariants, platformMatrix } from '../affected-variants.mjs';
import { VARIANT_IDS } from '../lib.mjs';

describe('affectedVariants', () => {
  it('reaches only the variants whose own folder changed', () => {
    assert.deepEqual(affectedVariants(['apps/omni/variants/unit/variant.json', 'apps/omni/variants/ic/app/index.tsx']), { variants: ['unit', 'ic'], shared: false });
  });

  it('reaches every variant through shared code, the desktop shell, configuration or docs', () => {
    for (const file of ['packages/features/src/calls/call-list.tsx', 'apps/desktop/main.ts', 'pnpm-lock.yaml', 'apps/omni/app.config.ts', 'docs/architecture/omni-plan.md'])
      assert.deepEqual(affectedVariants(['apps/omni/variants/unit/nav.ts', file]), { variants: VARIANT_IDS, shared: true }, file);
  });

  it('treats an unknown variant folder and Windows separators like the factory does', () => {
    assert.equal(affectedVariants(['apps/omni/variants/wall/variant.json']).shared, true);
    assert.deepEqual(affectedVariants(['apps\\omni\\variants\\bigboard\\nav.ts']).variants, ['bigboard']);
  });

  it('keeps to the selected variants', () => {
    assert.deepEqual(affectedVariants(['packages/ui/button.tsx'], ['unit', 'ic']).variants, ['unit', 'ic']);
  });
});

describe('platformMatrix', () => {
  it('tests every variant on every selected platform', () => {
    assert.deepEqual(platformMatrix(['unit'], ['ios', 'electron']), { ios: ['unit'], android: [], electron: ['unit'] });
    assert.deepEqual(platformMatrix([]), { ios: [], android: [], electron: [] });
  });
});
