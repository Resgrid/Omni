import { getActiveVariant, getCapability, hasModule } from './runtime';
import type { Capabilities, FeatureModuleId, VariantManifest } from './schema';

// The manifest is fixed for the lifetime of a build, so these hooks read it directly: there is
// nothing to subscribe to and no re-render to trigger.

export function useActiveVariant(): VariantManifest {
  return getActiveVariant();
}

export function useCapability<K extends keyof Capabilities>(key: K): Capabilities[K] {
  return getCapability(key);
}

export function useHasModule(moduleId: FeatureModuleId): boolean {
  return hasModule(moduleId);
}
