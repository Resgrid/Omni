/**
 * Android notification channels and iOS notification categories (omni-plan §7.6, §10.2a).
 *
 * The server targets Android channels by id (NovuProvider: `channelId = type`, the push sound type) and iOS
 * categories by the event code's first letter. The legacy apps created only `calls`, `0`–`3`, `notif`, `message` and
 * `c1`–`c25`, and registered only the `calls` category, so types `4`, `5`, `6`–`26` landed on a channel that did not
 * exist (Android falls back to the miscellaneous channel and its default sound) and iOS `messages`/`notifications`/
 * `chats` pushes had no category. Omni creates EVERY channel id the server can send, each with the modern sound for
 * that type's meaning (D17), and registers all four categories.
 *
 * Pure data and builders, no native imports, so the set is testable and usable from the config plugin's tests.
 */
import { CUSTOM_TONES, EXTRA_CHANNEL_SOUNDS, type NotificationSound, PUSH_SOUND_TYPE_SOUNDS, PUSH_SOUND_TYPES, type PushSoundTypeName, type PushSoundTypeValue } from './sounds';

export type ChannelKind = 'call' | 'alert' | 'notification' | 'message' | 'chat' | 'status' | 'custom';

export interface AndroidChannelSpec {
  /** Channel id exactly as Core sends it. Never change one: an Android channel's sound is fixed at creation. */
  id: string;
  /** Translation key of the channel name shown in the system notification settings. */
  nameKey: string;
  /** English fallback (and interpolation values) for the name. */
  defaultName: string;
  nameParams?: Record<string, string | number>;
  sound: NotificationSound;
  kind: ChannelKind;
  vibration: boolean;
}

/** Channel names: the classic ids carry "(classic)" so the system settings list never shows two identical names. */
const SOUND_TYPE_CHANNELS: Record<PushSoundTypeName, { key: string; name: string; kind: ChannelKind }> = {
  CallEmergency: { key: 'call_emergency_classic', name: 'Emergency Call (classic)', kind: 'call' },
  CallHigh: { key: 'call_high_classic', name: 'High Call (classic)', kind: 'call' },
  CallMedium: { key: 'call_medium_classic', name: 'Medium Call (classic)', kind: 'call' },
  CallLow: { key: 'call_low_classic', name: 'Low Call (classic)', kind: 'call' },
  Notifiation: { key: 'notification_classic', name: 'Notification (classic)', kind: 'notification' },
  Message: { key: 'message_classic', name: 'Message (classic)', kind: 'message' },
  Beep: { key: 'beep_classic', name: 'Beep (classic)', kind: 'notification' },
  ModernCallEmergency: { key: 'call_emergency', name: 'Emergency Call', kind: 'call' },
  ModernCallHigh: { key: 'call_high', name: 'High Call', kind: 'call' },
  ModernCallMedium: { key: 'call_medium', name: 'Medium Call', kind: 'call' },
  ModernCallLow: { key: 'call_low', name: 'Low Call', kind: 'call' },
  ModernNotification: { key: 'notification', name: 'Notification', kind: 'notification' },
  ModernMessage: { key: 'message', name: 'Message', kind: 'message' },
  ModernChat: { key: 'chat', name: 'Chat', kind: 'chat' },
  ModernCallUpdated: { key: 'call_updated', name: 'Call Updated', kind: 'call' },
  ModernCallClosed: { key: 'call_closed', name: 'Call Closed', kind: 'notification' },
  ModernTroubleAlert: { key: 'trouble_alert', name: 'Trouble Alert', kind: 'alert' },
  ModernPersonnelStatus: { key: 'personnel_status', name: 'Personnel Status', kind: 'status' },
  ModernUnitStatus: { key: 'unit_status', name: 'Unit Status', kind: 'status' },
  ModernStaffing: { key: 'staffing', name: 'Staffing', kind: 'status' },
  ModernShift: { key: 'shift', name: 'Shift', kind: 'notification' },
  ModernTraining: { key: 'training', name: 'Training', kind: 'notification' },
  ModernCalendar: { key: 'calendar', name: 'Calendar', kind: 'notification' },
  ModernAvailabilityAlert: { key: 'availability_alert', name: 'Availability Alert', kind: 'alert' },
  ModernWeatherAlert: { key: 'weather_alert', name: 'Weather Alert', kind: 'alert' },
  ModernUnitNotice: { key: 'unit_notice', name: 'Unit Notice', kind: 'notification' },
  ModernResourceOrder: { key: 'resource_order', name: 'Resource Order', kind: 'notification' },
};

/** Calls, alerts and custom call tones vibrate; routine notices do not (Unit baseline: `notif`/`message` silent-vibrate). */
const VIBRATING_KINDS: ReadonlySet<ChannelKind> = new Set<ChannelKind>(['call', 'alert', 'custom']);

const channelNameKey = (key: string): string => `push_notifications.channels.${key}`;

const spec = (id: string, key: string, defaultName: string, sound: NotificationSound, kind: ChannelKind, nameParams?: Record<string, string | number>): AndroidChannelSpec => ({
  id,
  nameKey: channelNameKey(key),
  defaultName,
  ...(nameParams ? { nameParams } : {}),
  sound,
  kind,
  vibration: VIBRATING_KINDS.has(kind),
});

const soundTypeEntries = Object.entries(PUSH_SOUND_TYPES) as [PushSoundTypeName, PushSoundTypeValue][];

/** Every Android channel id the server can send, each with its modern sound (or the department's custom tone). */
export const ANDROID_CHANNELS: readonly AndroidChannelSpec[] = [
  spec('calls', 'generic_call', 'Generic Call', EXTRA_CHANNEL_SOUNDS.calls, 'call'),
  ...soundTypeEntries.map(([name, value]) => {
    const channel = SOUND_TYPE_CHANNELS[name];
    return spec(String(value), channel.key, channel.name, PUSH_SOUND_TYPE_SOUNDS[value], channel.kind);
  }),
  ...CUSTOM_TONES.map((tone, index) => spec(tone, 'custom_tone', 'Custom Call Tone {{number}}', tone, 'custom', { number: index + 1 })),
  spec('notif', 'general_notification', 'Notifications', EXTRA_CHANNEL_SOUNDS.notif, 'notification'),
  spec('message', 'general_message', 'Messages', EXTRA_CHANNEL_SOUNDS.message, 'message'),
];

export const ANDROID_CHANNEL_IDS: readonly string[] = ANDROID_CHANNELS.map((channel) => channel.id);

/** Vibration pattern for channels that vibrate (Unit baseline). */
export const CHANNEL_VIBRATION_PATTERN: readonly number[] = [300, 500];
/** LED colour for channels (Unit baseline). */
export const CHANNEL_LIGHT_COLOR = '#FF231F7C';

/** iOS categories Core sends (`aps.category`, from the event code's first letter: c calls, m messages, n notifications, t/g chats). */
export const IOS_CATEGORY_IDS = ['calls', 'messages', 'notifications', 'chats'] as const;
export type IosCategoryId = (typeof IOS_CATEGORY_IDS)[number];

/** Action ids on notifications. `check-in` is also the Android notifee press action of the check-in timer notification. */
export const VIEW_ACTION_ID = 'view';
export const CHECK_IN_ACTION_ID = 'check-in';

/** Structurally compatible with notifee's `IOSNotificationCategory` (kept local so this module has no native import). */
export interface IosCategorySpec {
  id: IosCategoryId;
  actions?: { id: string; title: string; foreground?: boolean }[];
}

export type ChannelTranslate = (key: string, defaultValue: string, params?: Record<string, string | number>) => string;

/** Builds the four iOS categories; `calls` carries View and, for variants with check-in actions, Check In. */
export const buildIosCategories = (options: { checkInActions: boolean; translate: ChannelTranslate }): IosCategorySpec[] => {
  const { translate } = options;
  const callActions = [{ id: VIEW_ACTION_ID, title: translate('push_notifications.view_call', 'View Call'), foreground: true }];
  if (options.checkInActions) {
    // Foreground: the check-in posts through the app's own store (outbox when offline), which needs the JS runtime.
    callActions.push({ id: CHECK_IN_ACTION_ID, title: translate('check_in.perform_check_in', 'Check In'), foreground: true });
  }
  return [{ id: 'calls', actions: callActions }, { id: 'messages' }, { id: 'notifications' }, { id: 'chats' }];
};
