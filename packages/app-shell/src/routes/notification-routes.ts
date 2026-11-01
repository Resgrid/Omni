import type { NotificationTarget } from '@resgrid/notifications';
import type { Href } from 'expo-router';

import { getHrefBuilders, type HrefBuilders } from './href';

/**
 * Maps a push/inbox target to the variant's route (notifications' `resolveRoute`). Null means this variant has no
 * screen for it, and notifications falls back to the push modal. Ids were already checked with `isSafeRouteId`.
 */
export function resolveNotificationRoute(target: NotificationTarget, href: HrefBuilders = getHrefBuilders()): Href | null {
  switch (target.kind) {
    case 'call':
      return href.callDetail(target.id);
    case 'chat':
      return href.chatChannel(target.id);
    case 'chatbot':
      return href.chatbot();
    case 'weatherAlert':
      return href.weatherAlertDetail(target.id);
    case 'message':
      return href.messageDetail(target.id);
    case 'workOrder':
      return href.workOrderDetail(target.id);
    case 'signInApproval':
      return href.build('approveSignIn', {}, { requestId: target.id });
    case 'notification':
    case 'communicationTest':
      return null;
    default:
      return null;
  }
}
