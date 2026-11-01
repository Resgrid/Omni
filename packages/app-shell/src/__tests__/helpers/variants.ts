import fs from 'node:fs';
import path from 'node:path';

import { parseVariantManifest, resetActiveVariantForTests, setActiveVariant, type VariantId, type VariantManifest } from '@resgrid/config';

export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
export const VARIANTS_DIR = path.join(REPO_ROOT, 'apps', 'omni', 'variants');

export function loadManifest(id: VariantId): VariantManifest {
  return parseVariantManifest(JSON.parse(fs.readFileSync(path.join(VARIANTS_DIR, id, 'variant.json'), 'utf8')));
}

/** Activates a variant for a test (the root layout does this in the app). */
export function activateVariant(id: VariantId, patch?: (manifest: VariantManifest) => VariantManifest): VariantManifest {
  resetActiveVariantForTests();
  const manifest = patch ? patch(loadManifest(id)) : loadManifest(id);
  setActiveVariant(manifest);
  return manifest;
}

export const appDirOf = (id: VariantId): string => path.join(VARIANTS_DIR, id, 'app');
