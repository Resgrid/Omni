import { getCurrentUsersRights } from '@resgrid/api';
import type { DepartmentRightsResultData } from '@resgrid/models';
import { CONTRACT_KEYS, registerStoreReset } from '@resgrid/offline';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { httpFailureOf } from '../errors/http-shape';
import { getAuthApiContext } from '../runtime/api-context';
import { authLogger, describeError } from '../runtime/logger';
import { applyApiCacheScope } from '../runtime/services';
import { lateBoundStateStorage, storeKv } from '../runtime/storage';

// ---------------------------------------------------------------------------------------------------------------------
// The signed-in member's rights (omni-plan §7.3): Unit's store — persisted (`security-storage`, frozen name) so gating
// works offline, kept as they were when a refresh fails (Responder nulled them: the bug), API cache re-scoped on a
// department change — with Responder's generation guard (a request still in flight at sign-out never writes over the
// reset) and memoized hook. The server decides access; never infer it from raw permissions.
// ---------------------------------------------------------------------------------------------------------------------

export const SECURITY_STORE_NAME = CONTRACT_KEYS.securityStore;

export interface SecurityState {
  rights: DepartmentRightsResultData | null;
  error: string | null;
  /** True once rights were fetched (or restored) for this session. */
  isLoaded: boolean;
  getRights: () => Promise<DepartmentRightsResultData | null>;
}

let sessionGeneration = 0;
let inFlight: Promise<DepartmentRightsResultData | null> | null = null;

export const securityStore = create<SecurityState>()(
  persist(
    (set, get) => ({
      rights: null,
      error: null,
      isLoaded: false,
      getRights: () => {
        if (inFlight) {
          return inFlight;
        }
        const generation = sessionGeneration;
        const run = (async (): Promise<DepartmentRightsResultData | null> => {
          try {
            const response = await getCurrentUsersRights(getAuthApiContext());
            if (generation !== sessionGeneration) {
              return null;
            }
            const data = response?.Data ?? null;
            if (!data) {
              // An empty answer is not a verdict: keep what gated this session so far.
              set({ error: 'invalid_rights_response', isLoaded: true });
              return get().rights;
            }
            const current = get().rights;
            // Only update when the rights changed, so subscribers do not re-render on every refresh.
            if (!current || JSON.stringify(current) !== JSON.stringify(data)) {
              set({ rights: data, error: null, isLoaded: true });
            } else {
              set({ error: null, isLoaded: true });
            }
            return data;
          } catch (error) {
            if (generation !== sessionGeneration) {
              return null;
            }
            // Offline or a server blip: the persisted rights stay in place rather than blocking the app (Unit).
            const answered = httpFailureOf(error)?.answered === true;
            (answered ? authLogger.error : authLogger.warn)({ message: 'Failed to fetch user rights', context: describeError(error) });
            set({ error: answered ? 'rights_request_failed' : 'network_error', isLoaded: true });
            return get().rights;
          }
        })();
        inFlight = run;
        void run.finally(() => {
          if (inFlight === run) {
            inFlight = null;
          }
        });
        return run;
      },
    }),
    {
      name: SECURITY_STORE_NAME,
      storage: createJSONStorage(() => lateBoundStateStorage(() => storeKv(SECURITY_STORE_NAME))),
      skipHydration: true,
      partialize: (state) => ({ rights: state.rights }),
      merge: (persisted, current) => {
        const rights = (persisted as { rights?: DepartmentRightsResultData | null } | undefined)?.rights ?? null;
        return { ...current, rights, isLoaded: rights !== null };
      },
    }
  )
);

/** The active department id ('' is "no department"). */
const departmentIdOf = (rights: DepartmentRightsResultData | null | undefined): string | null => (rights?.DepartmentId ? String(rights.DepartmentId) : null);

// A member can be moved between departments without signing out; rights are where the active department is decided. The
// API cache identity embeds the department, so a change drops what the previous department cached.
securityStore.subscribe((state, previous) => {
  const departmentId = departmentIdOf(state.rights);
  if (departmentId !== departmentIdOf(previous.rights)) {
    applyApiCacheScope({ departmentId });
  }
});

/** Sign-out (and every wipe): rights belong to the session that loaded them. */
export function resetSecurity(): void {
  sessionGeneration += 1;
  inFlight = null;
  securityStore.setState({ rights: null, error: null, isLoaded: false });
}

registerStoreReset('auth.security', () => resetSecurity());

export const getCurrentRights = (): DepartmentRightsResultData | null => securityStore.getState().rights;

export const getActiveDepartmentId = (): string | null => departmentIdOf(securityStore.getState().rights);

export interface SecurityView {
  rights: DepartmentRightsResultData | null;
  error: string | null;
  getRights: () => Promise<DepartmentRightsResultData | null>;
  isUserDepartmentAdmin: boolean;
  isUserGroupAdmin: (groupId: number) => boolean;
  canUserCreateCalls: boolean;
  canUserCreateNotes: boolean;
  canUserCreateMessages: boolean;
  canUserViewPII: boolean;
  departmentCode: string | null;
}

/** Field selectors plus a memoized view, so call sites get a stable identity while the rights are unchanged (Responder). */
export const useSecurity = (): SecurityView => {
  const rights = securityStore((state) => state.rights);
  const error = securityStore((state) => state.error);
  const getRights = securityStore((state) => state.getRights);
  return useMemo(
    () => ({
      rights,
      error,
      getRights,
      isUserDepartmentAdmin: rights?.IsAdmin === true,
      isUserGroupAdmin: (groupId: number) => rights?.Groups?.some((right) => right.GroupId === groupId && right.IsGroupAdmin) ?? false,
      canUserCreateCalls: rights?.CanCreateCalls === true,
      canUserCreateNotes: rights?.CanAddNote === true,
      canUserCreateMessages: rights?.CanCreateMessage === true,
      canUserViewPII: rights?.CanViewPII === true,
      departmentCode: rights?.DepartmentCode || null,
    }),
    [rights, error, getRights]
  );
};
