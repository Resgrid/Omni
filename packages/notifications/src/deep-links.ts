/**
 * Opening what a notification points at — shared by native taps, notifee presses, web/desktop clicks, desktop toasts
 * and the inbox. The variant maps the typed target to a route (`resolveRoute`, injected; null = this app has no screen
 * for it). Navigation waits for the router AND the signed-in session (`routerPushWithRetry`, 40 × 250 ms): a push
 * before the root layout mounts is silently dropped, and a protected route pushed before the session hydrates is
 * replaced by the auth guard. Anything that does not land falls back to the push modal.
 */
import { logger, routerPushWithRetry } from '@resgrid/core';

import { getOptionalNotificationsDependencies, readSignedIn } from './configure';
import type { NotificationTarget } from './event-codes';
import { parseNotificationData, type PushNotificationData, type ShowNotificationOptions, usePushNotificationModalStore } from './push-modal-store';

export const DEEP_LINK_MAX_ATTEMPTS = 40;
export const DEEP_LINK_RETRY_DELAY_MS = 250;

/** Resolves true once the target's route has been pushed; false when the variant has no route for it or it never landed. */
export async function navigateToNotificationTarget(target: NotificationTarget): Promise<boolean> {
  const deps = getOptionalNotificationsDependencies();
  if (!deps?.resolveRoute) {
    return false;
  }

  let href: ReturnType<NonNullable<typeof deps.resolveRoute>>;
  try {
    href = deps.resolveRoute(target);
  } catch (error) {
    logger.error({ message: 'Notification route resolver failed', context: { kind: target.kind, error } });
    return false;
  }
  if (!href) {
    return false;
  }

  try {
    await routerPushWithRetry(href, { maxAttempts: DEEP_LINK_MAX_ATTEMPTS, retryDelayMs: DEEP_LINK_RETRY_DELAY_MS, waitUntil: () => readSignedIn(deps) });
    return true;
  } catch (error) {
    logger.error({ message: 'Failed to deep-link from a notification', context: { kind: target.kind, error } });
    return false;
  }
}

export interface OpenNotificationOptions extends ShowNotificationOptions {
  /** Show the modal when the notification does not navigate (default true). */
  fallbackToModal?: boolean;
}

/**
 * Opens a tapped/clicked notification: navigates when its target routes somewhere in this variant, otherwise shows
 * the push modal. Resolves true when it navigated.
 */
export async function openNotification(notification: PushNotificationData, options: OpenNotificationOptions = {}): Promise<boolean> {
  if (!notification?.eventCode || typeof notification.eventCode !== 'string') {
    return false;
  }
  const parsed = parseNotificationData(notification);
  if (parsed.target && (await navigateToNotificationTarget(parsed.target))) {
    return true;
  }
  if (options.fallbackToModal !== false) {
    await usePushNotificationModalStore.getState().showNotificationModal(notification, options.playSound ? { playSound: true } : {});
  }
  return false;
}
