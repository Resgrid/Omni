import { parseVariantManifest, resetActiveVariantForTests, setActiveVariant, type VariantId, type VariantManifest } from '@resgrid/config';
import { readFileSync } from 'fs';
import { join } from 'path';

/** The real manifest of a variant (frozen identity values: client ids, schemes, storage instances, capabilities). */
export function loadManifest(variant: VariantId): VariantManifest {
  const file = join(__dirname, '..', '..', '..', '..', '..', 'apps', 'omni', 'variants', variant, 'variant.json');
  return parseVariantManifest(JSON.parse(readFileSync(file, 'utf8')));
}

export function activateVariant(variant: VariantId, patch?: (manifest: VariantManifest) => VariantManifest): VariantManifest {
  resetActiveVariantForTests();
  const manifest = patch ? patch(loadManifest(variant)) : loadManifest(variant);
  setActiveVariant(manifest);
  return manifest;
}
