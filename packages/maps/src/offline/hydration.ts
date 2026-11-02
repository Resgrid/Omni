import type { HydrationStep } from '@resgrid/offline';

import { isDeferredOfflineMapsResult, type OfflinePackManager } from './manager';

/** The map packs step of shift-start hydration (offline-first §6, MapLibre plan §19.8–19.9). */
export const OFFLINE_MAPS_HYDRATION_STEP_ID = 'maps.offline-packs';

/** Thrown when the step fails (the error name is the offline maps code; never a URL). */
export class OfflineMapsHydrationError extends Error {
  constructor(readonly code: string) {
    super('Offline maps hydration failed');
    this.name = code;
  }
}

type HydrationManager = Pick<OfflinePackManager, 'autoSync' | 'isHydrationCurrent'>;

/**
 * Registers map packs with the sync orchestrator: `isCurrent` = the manifest is fresh and DepartmentData + the
 * response-area base map are installed (or there is nothing to do automatically: department without packs, policy
 * "manual", member deleted them); `run` = `autoSync` with its download progress. Waiting for Wi-Fi or a network is
 * not a failure — the step finishes, stays "not current", and the next hydration, reconnect or foreground continues.
 */
export function createOfflineMapsHydrationStep(manager: HydrationManager, options: { required?: boolean } = {}): HydrationStep {
  return {
    id: OFFLINE_MAPS_HYDRATION_STEP_ID,
    required: options.required ?? true,
    isCurrent: () => manager.isHydrationCurrent(),
    run: async (context) => {
      const result = await manager.autoSync({ onProgress: (fraction) => context.reportProgress(fraction) });
      if (!isDeferredOfflineMapsResult(result)) {
        throw new OfflineMapsHydrationError(result.ok ? 'unknown' : result.code);
      }
      context.reportProgress(1);
    },
  };
}
