// @resgrid/features/notifications — the Novu inbox screen (safe route ids, openInboxItem) and the foreground push modal.
export { NotificationDetailSheet, type NotificationDetailSheetProps } from './components/notification-detail-sheet';
export { NotificationRow, type NotificationRowProps } from './components/notification-row';
export { PushNotificationModal } from './components/push-notification-modal';
export { inboxDetailEntries, type InboxItem, inboxTargetOf, type NovuNotificationLike, toInboxItem } from './lib/inbox-item';
export { type FeatureNavEntry, notificationsNav } from './nav';
export { NOTIFICATIONS_ROUTE_PATTERNS, notificationsRoutes } from './routes';
export { default as NotificationsInboxScreen, type NotificationsInboxScreenProps } from './screens/notifications-inbox';
