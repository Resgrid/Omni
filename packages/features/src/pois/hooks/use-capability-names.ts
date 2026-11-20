import { usePoisStore } from '@resgrid/data';
import type { PoiResultData } from '@resgrid/models';
import { useEffect, useMemo } from 'react';

/** Names a capability id; the POI, when given, names one the department's list does not have. */
export type CapabilityNamer = (id: string, poi?: Pick<PoiResultData, 'CapabilityIds' | 'Capabilities'> | null) => string;

/**
 * Names capability ids (destination rules send ids): the department's capability list, loaded once while `enabled`, else
 * the POI's own name for it, else the id.
 */
export function useCapabilityNames(enabled = true): CapabilityNamer {
  const capabilities = usePoisStore((state) => state.poiCapabilities);

  useEffect(() => {
    if (enabled) void usePoisStore.getState().fetchPoiCapabilities();
  }, [enabled]);

  return useMemo(() => {
    const names = new Map(capabilities.map((capability) => [capability.PoiCapabilityId.trim().toLowerCase(), capability.Name]));

    return (id, poi) => {
      const key = id.trim().toLowerCase();
      const known = names.get(key);

      if (known) return known;

      const index = (poi?.CapabilityIds ?? []).findIndex((value) => value.trim().toLowerCase() === key);

      return index >= 0 ? (poi?.Capabilities?.[index] ?? id) : id;
    };
  }, [capabilities]);
}
