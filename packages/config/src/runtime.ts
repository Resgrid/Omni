import type { Capabilities, FeatureModuleId, VariantId, VariantManifest } from './schema';

/**
 * The active variant is set once, at module evaluation of the variant's root layout
 * (`apps/omni/variants/<id>/app/_layout.tsx`), before anything reads it. Services outside React
 * call `getActiveVariant()`; components use the hooks below.
 */
let activeVariant: VariantManifest | null = null;

export function setActiveVariant(manifest: VariantManifest): void {
  if (activeVariant && activeVariant.id !== manifest.id) {
    throw new Error(`Active variant already set to "${activeVariant.id}"; cannot switch to "${manifest.id}" at runtime.`);
  }
  activeVariant = manifest;
}

export function getActiveVariant(): VariantManifest {
  if (!activeVariant) {
    throw new Error('No active variant. The variant root layout must call setActiveVariant() before the app reads configuration.');
  }
  return activeVariant;
}

export function getActiveVariantId(): VariantId {
  return getActiveVariant().id;
}

export function getCapabilities(): Capabilities {
  return getActiveVariant().capabilities;
}

/** Typed capability lookup, e.g. `getCapability('calls')?.create`. */
export function getCapability<K extends keyof Capabilities>(key: K): Capabilities[K] {
  return getCapabilities()[key];
}

export function hasModule(moduleId: FeatureModuleId): boolean {
  return getActiveVariant().modules.includes(moduleId);
}

/** Test helper: resets the active variant between tests. Not for app code. */
export function resetActiveVariantForTests(): void {
  activeVariant = null;
}
