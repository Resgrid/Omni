// @resgrid/notifications (layer L3) — push (native / web / Electron), notifee channels and iOS categories, the event
// code parser and deep-link resolver, the foreground push modal store, desktop toasts, the Novu inbox configuration,
// badge handling and in-app notification sounds (omni-plan §7.6, D17, §10.2a; resgrid-realtime-push skill).
// Imports only config, models, core, i18n, api and offline among Omni packages; the session, routes and check-in
// action are injected with configureNotifications().

export { clearBadgeCount, useClearBadgeOnForeground } from './badge';
export {
  ANDROID_CHANNEL_IDS,
  ANDROID_CHANNELS,
  type AndroidChannelSpec,
  buildIosCategories,
  CHANNEL_LIGHT_COLOR,
  CHANNEL_VIBRATION_PATTERN,
  type ChannelKind,
  CHECK_IN_ACTION_ID,
  IOS_CATEGORY_IDS,
  type IosCategoryId,
  type IosCategorySpec,
  VIEW_ACTION_ID,
} from './channels';
export {
  configureNotifications,
  getNotificationsDependencies,
  getPushSubjectKind,
  type NotificationsDependencies,
  type NotificationsSession,
  type PushSubjectKind,
  resetNotificationsConfigurationForTests,
  type WebPushFirebaseConfig,
} from './configure';
export { DEEP_LINK_MAX_ATTEMPTS, DEEP_LINK_RETRY_DELAY_MS, navigateToNotificationTarget, openNotification, type OpenNotificationOptions } from './deep-links';
export {
  type DesktopNotificationPayload,
  type ElectronNotificationsBridge,
  getElectronNotificationsBridge,
  initializeDesktopNotifications,
  resetDesktopNotificationsForTests,
  showDesktopNotification,
} from './desktop-notifications';
export {
  categoryForEventCode,
  extractPushNotificationData,
  isCriticalEventCode,
  type NotificationKind,
  type NotificationRequestLike,
  type NotificationTarget,
  type ParsedEventCode,
  parseEventCode,
  type ParseEventCodeOptions,
  type PushCategory,
  resolveNotificationTarget,
} from './event-codes';
export { configureNotificationSounds, KIND_SOUNDS, type NotificationSoundAssets, type NotificationSoundRequest, notificationSoundService, soundForNotification } from './notification-sound';
export {
  buildNovuSubscriberId,
  inboxItemTarget,
  isNovuInboxEnabled,
  NOVU_PLACEHOLDER_CONFIG,
  type NovuInboxConfig,
  type NovuInboxItemLike,
  type NovuServerConfig,
  resolveNovuInboxConfig,
  type ResolveNovuInboxConfigInput,
  selectNovuSubscriberHash,
} from './novu';
export { NotificationsInboxProvider, type NotificationsInboxProviderProps, openInboxItem, useNovuInboxConfig, type UseNovuInboxConfigInput, useUnitSubscriberHash } from './novu-provider';
export { type ParsedNotification, parseNotificationData, type PushNotificationData, type PushNotificationModalState, type ShowNotificationOptions, usePushNotificationModalStore } from './push-modal-store';
export { pushNotificationService, usePushNotifications } from './push-notification';
export type { PushNotificationService, PushRegistrationTrigger, RegisterOptions, UsePushNotificationsResult } from './push-types';
export { createMemoryNotificationsKv, NATIVE_PUSH_REGISTRATION_KEY, NATIVE_PUSH_STALE_REGISTRATIONS_KEY, type NotificationsKv, type StoredNativePushRegistration } from './registration-storage';
export {
  CUSTOM_TONE_COUNT,
  CUSTOM_TONES,
  type CustomTone,
  EXTRA_CHANNEL_SOUNDS,
  IOS_SERVER_SOUND_ALIASES,
  MODERN_SOUNDS,
  type ModernSound,
  type NotificationSound,
  PUSH_SOUND_TYPE_SOUNDS,
  PUSH_SOUND_TYPES,
  type PushSoundTypeName,
  type PushSoundTypeValue,
  soundForSoundType,
} from './sounds';
