import { inboxItemTarget, type NotificationTarget } from '@resgrid/notifications';

/**
 * One Novu inbox entry as the screen needs it (Novu v3 field names: `subject`, `isRead`, `data`). Only `data`
 * survives on Novu inbox items; the push event code lives in `data.eventCode` (or `eventId`).
 */
export interface InboxItem {
  id: string;
  subject?: string | null;
  body: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown> | null;
}

/** The structural slice of a `@novu/js` Notification the inbox reads (its methods are called through the hook's item). */
export interface NovuNotificationLike {
  id: string;
  subject?: string | null;
  body: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown> | null;
}

export const toInboxItem = (notification: NovuNotificationLike): InboxItem => ({
  id: notification.id,
  subject: notification.subject ?? null,
  body: notification.body ?? '',
  isRead: notification.isRead === true,
  createdAt: notification.createdAt,
  data: notification.data && typeof notification.data === 'object' ? notification.data : null,
});

/** Where an inbox item points, or null for an unknown code or an unsafe id (rejected by `isSafeRouteId`). */
export const inboxTargetOf = (item: Pick<InboxItem, 'data'>): NotificationTarget | null => inboxItemTarget(item);

/** Extra data to show in the detail ("Additional information"), without the routing code. */
export const inboxDetailEntries = (item: Pick<InboxItem, 'data'>): [string, string][] =>
  Object.entries(item.data ?? {})
    .filter(([key, value]) => key !== 'eventCode' && key !== 'eventId' && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') && String(value).trim() !== '')
    .map(([key, value]) => [key, String(value)]);
