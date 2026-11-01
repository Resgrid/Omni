import { getConfig } from '@resgrid/api';
import { getEnv } from '@resgrid/core/env/env';
import { getDataApiContext, hasDataApiContext, registerDataStoreReset } from '@resgrid/data';
import type { GetConfigResultData } from '@resgrid/models';
import { create } from 'zustand';

/**
 * The department config the dashboard reads (`Config/GetConfig`): `OpenWeatherApiKey` for the weather widget,
 * `UnitStatusThresholds` / `UnitStatusAlertNoteRequirement` for unit alerts and the map centre and style fields for the
 * map widget. The app shell already loads it; it can hand its copy over with `setDashboardDepartmentConfig`, otherwise
 * the dashboard asks itself (a cached endpoint, so this is normally served from the API cache, offline included).
 */
export interface DashboardConfigState {
  config: GetConfigResultData | null;
  isLoading: boolean;
  hasError: boolean;
  load: (options?: { bypassCache?: boolean }) => Promise<void>;
}

let generation = 0;

export const useDashboardConfigStore = create<DashboardConfigState>()((set) => ({
  config: null,
  isLoading: false,
  hasError: false,
  load: async (options) => {
    if (!hasDataApiContext()) return;
    const started = ++generation;
    set({ isLoading: true });
    try {
      let key: string | undefined;
      try {
        key = getEnv().APP_KEY || undefined;
      } catch {
        key = undefined;
      }
      const result = await getConfig(getDataApiContext(), { key }, options?.bypassCache ? { forceRefresh: true } : undefined);
      if (started !== generation) return;
      set((state) => ({ config: result?.Data ?? state.config, isLoading: false, hasError: !result?.Data && !state.config }));
    } catch {
      // Keep whatever config is loaded: thresholds and the weather key must not vanish on a network blip.
      if (started === generation) set((state) => ({ isLoading: false, hasError: !state.config }));
    }
  },
}));

/** Lets the app shell share the config it loaded (and refreshed) so the dashboard never asks twice. */
export function setDashboardDepartmentConfig(config: GetConfigResultData | null): void {
  generation += 1;
  useDashboardConfigStore.setState({ config, isLoading: false, hasError: false });
}

export const useDashboardConfig = (): GetConfigResultData | null => useDashboardConfigStore((state) => state.config);

// The config belongs to the signed-in department: sign-out and department/server switches drop it (and any late answer).
registerDataStoreReset<DashboardConfigState>(
  'dashboard-config',
  useDashboardConfigStore,
  () => ({ config: null, isLoading: false, hasError: false }),
  () => {
    generation += 1;
  }
);
