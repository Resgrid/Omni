import { checkSharedSession, getBaseApiUrl, isPersonalLockEnabled, POLL_INTERVAL_MS, securityStore, useAuthStore, useInactivityLock, useSharedSessionStore } from '@resgrid/auth';
import { useActiveVariant } from '@resgrid/config';
import { logger } from '@resgrid/core';
import { useClearBadgeOnForeground, usePushNotifications } from '@resgrid/notifications';
import { useRealtimeLifecycle } from '@resgrid/realtime';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { sessionInit, startupInit } from '../init/app-init';
import { useActiveUnitId } from '../runtime/active-session';
import { getActiveUnitId } from '../runtime/session';
import { setShellState, useShellStore } from '../runtime/shell-state';

const startupReadySnapshot = (): boolean => startupInit.getStatus().everReady;
const sessionReadySnapshot = (): boolean => sessionInit.getStatus().everReady;

/** Starts the startup phase once, and the session phase on every sign-in (reset on sign-out or a user change). */
export function useInitLifecycle(signedIn: boolean, userId: string | null): void {
  const startupReady = useSyncExternalStore(startupInit.subscribe, startupReadySnapshot, startupReadySnapshot);
  const sessionKey = signedIn ? (userId ?? 'signed-in') : null;
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    void startupInit.run();
  }, []);

  useEffect(() => {
    if (!startupReady) {
      return;
    }
    if (lastKey.current !== sessionKey) {
      if (lastKey.current !== null) {
        // The previous session ended: retire its bootstrap (generation guard) so nothing from it lands later.
        sessionInit.reset();
      }
      lastKey.current = sessionKey;
      if (sessionKey) {
        setShellState({ accessDeniedNotice: false });
      }
    }
    if (sessionKey) {
      void sessionInit.run();
    }
  }, [startupReady, sessionKey]);
}

/**
 * Signed-in services that live as long as the app (no UI): the init phases, the realtime lifecycle (connect while
 * signed in and in the foreground, reconnect on resume, watchdog where the variant has one), push registration, badge
 * clearing, the personal inactivity lock and shared-device session polling. Mounted once in the root layout.
 */
export function SessionServices(): null {
  const variant = useActiveVariant();
  const status = useAuthStore((state) => state.status);
  const accessToken = useAuthStore((state) => state.accessToken);
  const userId = useAuthStore((state) => state.userId);
  const signedIn = status === 'signedIn' && !!accessToken;

  useInitLifecycle(signedIn, userId);

  const sessionReady = useSyncExternalStore(sessionInit.subscribe, sessionReadySnapshot, sessionReadySnapshot);
  const eventingUrl = useShellStore((state) => state.departmentConfig?.EventingUrl ?? null);
  const pushArmed = useShellStore((state) => state.pushRegistrationArmed);
  const webPushConfigured = useShellStore((state) => !!state.departmentConfig?.WebPushVapidKey);
  const departmentCode = securityStore((state) => state.rights?.DepartmentCode ?? null);

  useRealtimeLifecycle({ isSignedIn: signedIn, isReady: sessionReady && !!eventingUrl });
  // Re-render on a unit change so push registration follows the active unit (Unit's subscriber).
  useActiveUnitId();

  usePushNotifications({
    signedIn: signedIn && pushArmed,
    userId,
    departmentCode,
    unitId: getActiveUnitId(),
    serverUrl: signedIn ? getBaseApiUrl() : null,
    webPushConfigured,
  });

  useClearBadgeOnForeground(signedIn);

  // Personal inactivity lock (Dispatch): only for password sessions on personal devices (isPersonalLockEnabled).
  const personalLockActive = signedIn && variant.capabilities.auth.personalLock && isPersonalLockEnabled();
  useInactivityLock(personalLockActive, () => logger.info({ message: 'Personal lock engaged after inactivity' }));

  // Shared-device sessions: learn whether this session is shared at sign-in, then poll while it is.
  const shared = useSharedSessionStore((state) => state.shared);
  const sharedDevice = variant.capabilities.auth.sharedDevice;
  useEffect(() => {
    if (!signedIn || !sharedDevice || !sessionReady) {
      return undefined;
    }
    void checkSharedSession().catch(() => undefined);
    if (!shared) {
      return undefined;
    }
    const timer = setInterval(() => {
      void checkSharedSession().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [signedIn, sharedDevice, sessionReady, shared]);

  return null;
}
