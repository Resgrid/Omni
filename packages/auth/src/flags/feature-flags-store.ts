import { getAllFeatureFlags } from '@resgrid/api';
import type { VariantId } from '@resgrid/config';
import { registerStoreReset } from '@resgrid/offline';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getActiveDepartmentId, securityStore } from '../rights/security-store';
import { getAuthApiContext } from '../runtime/api-context';
import { authLogger, describeError } from '../runtime/logger';
import { lateBoundStateStorage, mainKv } from '../runtime/storage';
import { authManifest } from '../runtime/variant';
import { useAuthStore } from '../session/auth-store';

// ---------------------------------------------------------------------------------------------------------------------
// Department feature flags (omni-plan §7.3): Unit's store — persisted (`feature-flags-storage`) so gating stays stable
// offline, keyed by user + department so another identity's flags are never used — with Responder's reset registration.
// Flags are fetched AFTER rights (Unit fetched them in parallel, so the identity key had no department). Unknown flags are
// DISABLED. Capabilities decide what an app can do at all; flags decide what this department may use now.
// ---------------------------------------------------------------------------------------------------------------------

export const FEATURE_FLAGS_STORE_NAME = 'feature-flags-storage';

/** Well-known keys (Resgrid.Model.FeatureFlagKeys). */
export const FeatureFlagKeys = {
  ChatSystem: 'Chat.System',
  ChecklistsSystem: 'Checklists.System',
  RecordsSystem: 'Records.System',
  RecordsFieldResponder: 'Records.Field.Responder',
  RecordsFieldUnit: 'Records.Field.Unit',
  RecordsFieldIncidentCommand: 'Records.Field.IncidentCommand',
  RecordsFieldDispatch: 'Records.Field.Dispatch',
  MaintenanceWorkOrders: 'Maintenance.WorkOrders',
  DispatchRunCards: 'Dispatch.RunCards',
  /** Conditional run cards; depends on Dispatch.RunCards. */
  DispatchRunCardConditions: 'Dispatch.RunCardConditions',
  Deployments: 'Operations.Deployments',
  CalOesMars: 'CostRecovery.CalOesMars',
  WorkforceInternalCosting: 'Workforce.InternalCosting',
  NavigationInApp: 'Navigation.InApp',
  MapsOffline: 'Maps.Offline',
} as const;

export type FeatureFlagKey = (typeof FeatureFlagKeys)[keyof typeof FeatureFlagKeys];

const RECORDS_FIELD_KEYS: Partial<Record<VariantId, string>> = {
  responder: FeatureFlagKeys.RecordsFieldResponder,
  unit: FeatureFlagKeys.RecordsFieldUnit,
  ic: FeatureFlagKeys.RecordsFieldIncidentCommand,
  dispatch: FeatureFlagKeys.RecordsFieldDispatch,
};

/** This variant's Field Records child flag (each app has its own; BigBoard has none). */
export const recordsFieldFlagKey = (variantId: VariantId = authManifest().id): string | null => RECORDS_FIELD_KEYS[variantId] ?? null;

interface FeatureFlagEntry {
  enabled: boolean;
  value?: string | null;
}

export interface FeatureFlagsState {
  flags: Record<string, FeatureFlagEntry>;
  isLoaded: boolean;
  error: string | null;
  identityKey: string | null;
  fetchFlags: () => Promise<void>;
  isEnabled: (key: string, defaultValue?: boolean) => boolean;
}

// Immutable ids only (user id + department id) so renames never alias identities.
const currentIdentityKey = (): string | null => {
  const userId = useAuthStore.getState().userId;
  const departmentId = getActiveDepartmentId();
  return userId && departmentId ? `${userId}:${departmentId}` : null;
};

// True only when persisted flags provably belong to another account/department; with no proof (rights unavailable
// offline) they are kept so gating stays stable.
const isPersistedIdentityStale = (persistedKey: string | null): boolean => {
  if (!persistedKey) {
    return false;
  }
  const userId = useAuthStore.getState().userId;
  const departmentId = getActiveDepartmentId();
  if (userId && departmentId) {
    return persistedKey !== `${userId}:${departmentId}`;
  }
  if (userId) {
    return !persistedKey.startsWith(`${userId}:`);
  }
  return false;
};

let requestGeneration = 0;

export const featureFlagsStore = create<FeatureFlagsState>()(
  persist(
    (set, get) => ({
      flags: {},
      isLoaded: false,
      error: null,
      identityKey: null,
      fetchFlags: async () => {
        requestGeneration += 1;
        const generation = requestGeneration;
        // Flags are keyed by department, and the department comes from the rights: load those first.
        if (!securityStore.getState().rights) {
          await securityStore.getState().getRights();
          if (generation !== requestGeneration) {
            return;
          }
        }
        const identityKey = currentIdentityKey();
        if (isPersistedIdentityStale(get().identityKey)) {
          // Another identity's flags must never gate this one, even if the fetch below fails.
          set({ flags: {}, isLoaded: false, identityKey: null });
        }
        try {
          const response = await getAllFeatureFlags(getAuthApiContext());
          if (generation !== requestGeneration || identityKey !== currentIdentityKey()) {
            return;
          }
          const flags: Record<string, FeatureFlagEntry> = {};
          for (const flag of response?.Data ?? []) {
            if (flag?.Key) {
              flags[flag.Key] = { enabled: flag.Enabled === true, value: flag.Value ?? null };
            }
          }
          set({ flags, isLoaded: true, error: null, identityKey });
        } catch (error) {
          if (generation !== requestGeneration) {
            return;
          }
          // Recoverable: persisted flags keep gating stable and the next fetch repairs it (not a Sentry issue). Marking
          // isLoaded resolves flags with no persisted entry fail-closed instead of leaving them 'unknown' forever.
          authLogger.warn({ message: 'Failed to fetch feature flags', context: describeError(error) });
          set({ error: 'feature_flags_request_failed', isLoaded: true });
        }
      },
      isEnabled: (key, defaultValue = false) => get().flags[key]?.enabled ?? defaultValue,
    }),
    {
      name: FEATURE_FLAGS_STORE_NAME,
      storage: createJSONStorage(() => lateBoundStateStorage(mainKv)),
      skipHydration: true,
      // isLoaded is persisted deliberately: a rehydrated identity resolves unlisted flags fail-closed instead of 'unknown'.
      partialize: (state) => ({ flags: state.flags, isLoaded: state.isLoaded, identityKey: state.identityKey }),
    }
  )
);

/** Sign-out (and every wipe): the next session starts unknown and fails closed until its own flags arrive. */
export function resetFeatureFlags(): void {
  requestGeneration += 1;
  featureFlagsStore.setState({ flags: {}, isLoaded: false, error: null, identityKey: null });
}

registerStoreReset('auth.feature-flags', () => resetFeatureFlags());

/** Non-reactive check; unknown flags are disabled. */
export const isFeatureEnabled = (key: string, defaultValue = false): boolean => featureFlagsStore.getState().isEnabled(key, defaultValue);

/** Reactive check; components re-render when the flag changes. Unknown flags are disabled. */
export const useFeatureFlag = (key: string, defaultValue = false): boolean => featureFlagsStore((state) => state.flags[key]?.enabled ?? defaultValue);

export type FeatureFlagStatus = 'unknown' | 'enabled' | 'disabled';

/** Tri-state for gating that must not act before flags resolve (e.g. redirecting away from a deep link). */
export const getFeatureFlagStatus = (state: Pick<FeatureFlagsState, 'flags' | 'isLoaded'>, key: string): FeatureFlagStatus => {
  const entry = state.flags[key];
  if (entry) {
    return entry.enabled ? 'enabled' : 'disabled';
  }
  return state.isLoaded ? 'disabled' : 'unknown';
};

export const useFeatureFlagStatus = (key: string): FeatureFlagStatus => featureFlagsStore((state) => getFeatureFlagStatus(state, key));

export const useIsChatEnabled = (): boolean => useFeatureFlag(FeatureFlagKeys.ChatSystem);

/** Field Records: the parent Records.System flag AND this app's child flag (both hooks always run — rules of hooks). */
export const useIsRecordsFieldEnabled = (): boolean => {
  const system = useFeatureFlag(FeatureFlagKeys.RecordsSystem);
  const field = useFeatureFlag(recordsFieldFlagKey() ?? '__none__');
  return system && field;
};
