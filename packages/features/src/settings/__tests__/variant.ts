import fs from 'node:fs';
import path from 'node:path';

import { type Capabilities, parseVariantManifest, resetActiveVariantForTests, setActiveVariant, type VariantId, type VariantManifest } from '@resgrid/config';

type CapabilityOverrides = { [K in keyof Capabilities]?: Partial<Capabilities[K]> };

/** Loads a real variant manifest (apps/omni/variants/<id>/variant.json), optionally with capability overrides, and makes it active. */
export function activateTestVariant(id: VariantId, overrides: CapabilityOverrides = {}): VariantManifest {
  const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../../../apps/omni/variants/${id}/variant.json`), 'utf8')) as VariantManifest;
  const manifest = parseVariantManifest(raw);
  const capabilities = { ...manifest.capabilities } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    const current = capabilities[key];
    capabilities[key] = typeof current === 'object' && current !== null ? { ...(current as object), ...(value as object) } : value;
  }
  const next: VariantManifest = { ...manifest, capabilities: capabilities as Capabilities };
  resetActiveVariantForTests();
  setActiveVariant(next);
  return next;
}
