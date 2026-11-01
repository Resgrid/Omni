import { securityStore, useAuthStore } from '@resgrid/auth';
import { NotificationsInboxProvider, useNovuInboxConfig } from '@resgrid/notifications';
import React, { type ReactNode, useMemo } from 'react';
import { Platform } from 'react-native';

import { getActiveUnitId, getNotificationsSession } from '../runtime/session';
import { getAppShellOptions } from '../runtime/shell-config';
import { useShellStore } from '../runtime/shell-state';

/**
 * The always-mounted Novu provider (Responder's fix): placeholder credentials until the department config, rights (and
 * Unit's subscriber hash) arrive, so the screen tree is never unmounted when they do. Inbox UI renders only when the
 * config is `ready`.
 */
export function ShellInboxProvider({ children }: { children?: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.userId);
  const rights = securityStore((state) => state.rights);
  const departmentConfig = useShellStore((state) => state.departmentConfig);
  const isWeb = Platform.OS === 'web';
  // Web/Electron opt in (Dispatch and BigBoard ran without Novu on web): the provider opens a Novu session even with
  // placeholder credentials, which is a third-party request on every page load before anyone signs in.
  const enabled = !isWeb || getAppShellOptions().inboxOnWeb === true;

  // Recomputed when the session inputs change; the getter reads the stores at call time.
  const session = useMemo(() => (status === 'signedIn' && userId && rights ? getNotificationsSession() : null), [status, userId, rights]);
  const config = useNovuInboxConfig({ session, config: departmentConfig, unitId: getActiveUnitId(), isWeb });

  return (
    <NotificationsInboxProvider config={config} enabled={enabled}>
      {children}
    </NotificationsInboxProvider>
  );
}
