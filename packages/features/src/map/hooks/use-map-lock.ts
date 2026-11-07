import { dataPersistOptions, getDataStorageKv, registerPersistedStore } from '@resgrid/data';
import { registerPreservedKeys } from '@resgrid/offline';
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * "Lock map to unit" (Unit sidebar, legacy `useLocationStore.isMapLocked`): while locked the main map keeps following
 * the unit and ignores pan, zoom, rotate and tilt gestures, so a bump in a moving vehicle never loses the unit. A device
 * preference like the traffic overlay: persisted in the variant's storage and kept across logout, department and server
 * switches. Only unit devices (`status.subject === 'unit'`) follow their own position, so only they honour it.
 */
export interface MapLockState {
  isMapLocked: boolean;
  setMapLocked: (locked: boolean) => void;
}

type PersistedMapLock = Pick<MapLockState, 'isMapLocked'>;

export const MAP_LOCK_STORE_NAME = 'omni-map-lock-storage';

/** Where legacy Unit kept the choice (zustand persist JSON, next to `isBackgroundEnabled`). Read once, never written. */
export const LEGACY_LOCATION_STORE_NAME = 'location-storage';

const PersistedMapLockSchema = z.object({ isMapLocked: z.boolean() });

const LegacyLocationStorageSchema = z.object({ state: z.object({ isMapLocked: z.boolean() }) });

/** The legacy app's choice on a device upgraded from it; false when there is none or it cannot be read. */
const legacyMapLocked = (): boolean => {
  const raw = getDataStorageKv()?.getString(LEGACY_LOCATION_STORE_NAME);

  if (!raw) return false;

  try {
    const parsed = LegacyLocationStorageSchema.safeParse(JSON.parse(raw));

    return parsed.success ? parsed.data.state.isMapLocked : false;
  } catch {
    return false;
  }
};

/** The stored choice (parsed by the caller); with nothing stored yet (first launch after the upgrade), the legacy app's. */
const resolveMapLocked = (stored: z.infer<typeof PersistedMapLockSchema> | null | undefined): boolean => (stored ? stored.isMapLocked : legacyMapLocked());

export const useMapLockStore = create<MapLockState>()(
  persist(
    (set) => ({
      isMapLocked: false,
      setMapLocked: (locked) => set({ isMapLocked: locked }),
    }),
    dataPersistOptions<MapLockState, PersistedMapLock>({
      name: MAP_LOCK_STORE_NAME,
      partialize: (state) => ({ isMapLocked: state.isMapLocked }),
      merge: (persisted, current) => {
        const parsed = PersistedMapLockSchema.nullish().safeParse(persisted);

        return { ...current, isMapLocked: parsed.success ? resolveMapLocked(parsed.data) : false };
      },
    })
  )
);

registerPersistedStore(MAP_LOCK_STORE_NAME, useMapLockStore);

registerPreservedKeys([MAP_LOCK_STORE_NAME]);

/** `[isLocked, toggle]` for the map lock. */
export function useMapLock(): [boolean, () => void] {
  const isMapLocked = useMapLockStore((state) => state.isMapLocked);

  return [isMapLocked, toggleMapLock];
}

function toggleMapLock(): void {
  const { isMapLocked, setMapLocked } = useMapLockStore.getState();
  setMapLocked(!isMapLocked);
}
