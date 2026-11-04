import { getConfig } from '@resgrid/api';
import { getEnv } from '@resgrid/core/env/env';
import { logger } from '@resgrid/core/logging/logger';
import { getDataApiContext, hasDataApiContext, registerDataStoreReset, toDataError } from '@resgrid/data';
import type { GetConfigResultData } from '@resgrid/models';
import { create } from 'zustand';

/**
 * The signed-in department's config (`Config/GetConfig`) for feature screens: `UnitStatusThresholds` /
 * `UnitStatusAlertNoteRequirement` for unit status timers (BigBoard, Dispatch, Unit), and the weather key and map
 * centre and style fields for BigBoard's widgets. The app shell already loads it and hands its copy over with
 * `setDepartmentConfig`; otherwise a screen asks itself (a cached endpoint, so normally served from the API cache,
 * offline included).
 */
export interface DepartmentConfigState {
  config: GetConfigResultData | null;
  isLoading: boolean;
  hasError: boolean;
  load: (options?: { bypassCache?: boolean }) => Promise<void>;
}

let generation = 0;

// One request at a time: several screens (and the department push) ask at once, and each answer is the same config.
let inFlight: Promise<void> | null = null;

const appKey = (): string | undefined => {
  try {
    return getEnv().APP_KEY || undefined;
  } catch {
    return undefined;
  }
};

export const useDepartmentConfigStore = create<DepartmentConfigState>()((set) => ({
  config: null,
  isLoading: false,
  hasError: false,
  load: (options) => {
    if (!hasDataApiContext()) return Promise.resolve();

    if (inFlight) return inFlight;
    const started = ++generation;

    set({ isLoading: true });

    const fetchConfig = async (): Promise<void> => {
      try {
        const result = await getConfig(getDataApiContext(), { key: appKey() }, options?.bypassCache ? { forceRefresh: true } : undefined);

        if (started !== generation) return;
        set((state) => ({ config: result?.Data ?? state.config, isLoading: false, hasError: !result?.Data && !state.config }));
      } catch (error) {
        if (started !== generation) return;
        // The failure's kind only: the raw error carries the request (its Authorization header).
        const { code, status } = toDataError(error);

        logger.warn({ message: 'Department config load failed', context: { code, status } });
        // Keep whatever config is loaded: status timers and the weather key must not vanish on a network blip.
        set((state) => ({ isLoading: false, hasError: !state.config }));
      }
    };

    const request = fetchConfig().finally(() => {
      if (inFlight === request) inFlight = null;
    });

    inFlight = request;

    return request;
  },
}));

/** Lets the app shell share the config it loaded (and refreshed) so no screen asks twice. */
export function setDepartmentConfig(config: GetConfigResultData | null): void {
  generation += 1;
  inFlight = null;
  useDepartmentConfigStore.setState({ config, isLoading: false, hasError: false });
}

export const useDepartmentConfig = (): GetConfigResultData | null => useDepartmentConfigStore((state) => state.config);

// The config belongs to the signed-in department: sign-out and department/server switches drop it (and any late answer).
registerDataStoreReset<DepartmentConfigState>(
  'department-config',
  useDepartmentConfigStore,
  () => ({ config: null, isLoading: false, hasError: false }),
  () => {
    generation += 1;
    inFlight = null;
  }
);
