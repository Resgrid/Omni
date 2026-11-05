import { useAuthStore, useSecurity } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { useCallback, useMemo } from 'react';

import { type CallPermissionInput, type CallPermissions, type CallRights, resolveCallPermissions } from '../lib/call-permissions';

type PermissionCall = CallPermissionInput['call'];

/** The member's call rights from the rights DTO (stable while the rights are unchanged). */
export function useCallRights(): CallRights {
  const { isUserDepartmentAdmin, canUserCreateCalls, canUserCloseCalls, canUserDeleteCalls } = useSecurity();

  return useMemo(
    () => ({ isAdmin: isUserDepartmentAdmin, canCreateCalls: canUserCreateCalls, canCloseCalls: canUserCloseCalls, canDeleteCalls: canUserDeleteCalls }),
    [canUserCloseCalls, canUserCreateCalls, canUserDeleteCalls, isUserDepartmentAdmin]
  );
}

/** `resolveCallPermissions` for this member and app, for lists that ask once per call. */
export function useCallPermissionsResolver(): (call?: PermissionCall, now?: number) => CallPermissions {
  const calls = useCapability('calls');
  const rights = useCallRights();
  const userId = useAuthStore((state) => state.userId);

  return useCallback((call?: PermissionCall, now?: number) => resolveCallPermissions({ calls, rights, userId, call, now }), [calls, rights, userId]);
}

/** The call actions this member may take on `call` in this app (only `canCreate` without a call). */
export function useCallPermissions(call?: PermissionCall): CallPermissions {
  // Read on every render: whether a call is still scheduled depends on the clock.
  return useCallPermissionsResolver()(call);
}
