// Helpers for the Unit signature-module tests (not a test file). Import after the side-effect './test-setup'.
import { parseVariantManifest, resetActiveVariantForTests, setActiveVariant, type VariantManifest } from '@resgrid/config';

import unitManifest from '../../../../../apps/omni/variants/unit/variant.json';

/** Activates the real Unit manifest (capabilities, modules). */
export function activateUnitVariant(): VariantManifest {
  resetActiveVariantForTests();
  const manifest = parseVariantManifest(unitManifest);
  setActiveVariant(manifest);
  return manifest;
}

/** Sheets and dialogs render in a host Modal: reach their content with hidden elements included. */
export const hidden = { includeHiddenElements: true } as const;
