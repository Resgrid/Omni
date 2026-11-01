import { CONTRACT_KEYS, readLegacyString, writeLegacyString } from '@resgrid/offline';
import { create } from 'zustand';

import { getShellRuntime } from './runtime-holder';

/**
 * The device's active unit and active call (Unit's status console, chat as the unit, unit location and push, the
 * records context; the active call is the crew's current incident). Kept under the frozen legacy keys
 * (`activeUnitId`, `activeCallId` in the main instance) so an upgraded install keeps its selection; reactive so the
 * console, sidebar and providers follow a change at once. Session data: cleared on sign-out with the rest of the session.
 */
export interface ActiveSessionState {
  activeUnitId: string | null;
  activeCallId: string | null;
}

export const useActiveSessionStore = create<ActiveSessionState>()(() => ({ activeUnitId: null, activeCallId: null }));

const clean = (value: string | null | undefined): string | null => (value && value.trim() !== '' ? value.trim() : null);

const mainKv = () => getShellRuntime().offline?.storage.main ?? null;

const persist = (key: string, value: string | null): void => {
  const kv = mainKv();
  if (!kv) {
    return;
  }
  if (value) {
    writeLegacyString(kv, key, value);
  } else {
    kv.delete(key);
  }
};

/** Reads the stored selection (startup, once storage is open). */
export function loadActiveSession(): void {
  const kv = mainKv();
  if (!kv) {
    return;
  }
  useActiveSessionStore.setState({ activeUnitId: clean(readLegacyString(kv, CONTRACT_KEYS.activeUnitId)), activeCallId: clean(readLegacyString(kv, CONTRACT_KEYS.activeCallId)) });
}

/** Selects (or clears with null) the device's unit. Changing units clears the active call, which belonged to the old unit. */
export function setActiveUnitId(unitId: string | null): void {
  const next = clean(unitId);
  const current = useActiveSessionStore.getState();
  if (next === current.activeUnitId) {
    return;
  }
  persist(CONTRACT_KEYS.activeUnitId, next);
  persist(CONTRACT_KEYS.activeCallId, null);
  useActiveSessionStore.setState({ activeUnitId: next, activeCallId: null });
}

/** Sets (or clears with null) the active call. */
export function setActiveCallId(callId: string | null): void {
  const next = clean(callId);
  persist(CONTRACT_KEYS.activeCallId, next);
  useActiveSessionStore.setState({ activeCallId: next });
}

/** Forgets the selection in memory (the storage wipe removes the keys). */
export function resetActiveSession(): void {
  useActiveSessionStore.setState({ activeUnitId: null, activeCallId: null });
}

export const useActiveUnitId = (): string | null => useActiveSessionStore((state) => state.activeUnitId);
export const useActiveCallId = (): string | null => useActiveSessionStore((state) => state.activeCallId);
