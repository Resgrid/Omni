/**
 * Badge handling: the app badge is cleared whenever the app is opened or returns to the foreground (Core sets the iOS
 * badge to the active call / unread count on every push). Platform-agnostic: `pushNotificationService` resolves to
 * the native or web implementation.
 */
import { useAppLifecycle } from '@resgrid/core';
import { useEffect } from 'react';

import { pushNotificationService } from './push-notification';

export function clearBadgeCount(): Promise<void> {
  return pushNotificationService.clearBadge();
}

/** Clears the badge on mount and on every return to the foreground. */
export function useClearBadgeOnForeground(enabled: boolean = true): void {
  const { isActive } = useAppLifecycle();
  useEffect(() => {
    if (enabled && isActive) {
      void clearBadgeCount();
    }
  }, [enabled, isActive]);
}
