/**
 * Notification sounds (omni-plan D17, §7.6): Omni ships the MODERN sound set only. There is no modern/classic toggle
 * and no classic sound file in any build. Every sound type the server can name maps to the modern sound for that
 * type's meaning, so a department still on classic server settings hears modern sounds too.
 *
 * Pure data, no imports: the config plugin (packages/config-plugins/plugins/withNotificationSounds.js) mirrors
 * `MODERN_SOUNDS`, `CUSTOM_TONE_COUNT` and `IOS_SERVER_SOUND_ALIASES`, and its test checks they stay identical.
 */

/**
 * Core `Resgrid.Model.PushSoundTypes` (Core/Resgrid.Model/PushSoundTypes.cs). Core sends the value as a string in the
 * notification `type` field and as the Android `channelId` (NovuProvider: `channelId = type`). The misspelt
 * `Notifiation` is Core's name and stays.
 */
export const PUSH_SOUND_TYPES = {
  CallEmergency: 0,
  CallHigh: 1,
  CallMedium: 2,
  CallLow: 3,
  Notifiation: 4,
  Message: 5,
  Beep: 6,
  ModernCallEmergency: 7,
  ModernCallHigh: 8,
  ModernCallMedium: 9,
  ModernCallLow: 10,
  ModernNotification: 11,
  ModernMessage: 12,
  ModernChat: 13,
  ModernCallUpdated: 14,
  ModernCallClosed: 15,
  ModernTroubleAlert: 16,
  ModernPersonnelStatus: 17,
  ModernUnitStatus: 18,
  ModernStaffing: 19,
  ModernShift: 20,
  ModernTraining: 21,
  ModernCalendar: 22,
  ModernAvailabilityAlert: 23,
  ModernWeatherAlert: 24,
  ModernUnitNotice: 25,
  ModernResourceOrder: 26,
} as const;

export type PushSoundTypeName = keyof typeof PUSH_SOUND_TYPES;
export type PushSoundTypeValue = (typeof PUSH_SOUND_TYPES)[PushSoundTypeName];

/** The modern sound files in apps/omni/assets/audio (file stem; `.wav` on disk, raw resource name on Android). */
export const MODERN_SOUNDS = [
  'modernavailabilityalert',
  'moderncalendar',
  'moderncallclosed',
  'moderncallemergency',
  'moderncallhigh',
  'moderncalllow',
  'moderncallmedium',
  'moderncallupdated',
  'modernchat',
  'modernmessage',
  'modernnotification',
  'modernpersonnelstatus',
  'modernresourceorder',
  'modernshift',
  'modernstaffing',
  'moderntraining',
  'moderntroublealert',
  'modernunitnotice',
  'modernunitstatus',
  'modernweatheralert',
] as const;

export type ModernSound = (typeof MODERN_SOUNDS)[number];

/** Department custom call tones `c1`–`c25` (apps/omni/assets/audio/custom). Core sends `c{n}` as type and channel id. */
export const CUSTOM_TONE_COUNT = 25;

export type CustomTone = `c${number}`;

/** What a channel or in-app alert plays: a modern sound or a department custom tone. */
export type NotificationSound = ModernSound | CustomTone;

export const CUSTOM_TONES: readonly CustomTone[] = Array.from({ length: CUSTOM_TONE_COUNT }, (_, index): CustomTone => `c${index + 1}`);

/**
 * Sound per server sound type, by the type's MEANING (D17). The classic types (0–6) get the modern sound of the same
 * meaning; `Beep` (6) has no modern twin and gets the generic modern notification.
 *
 * | type | Core name               | sound                   |
 * |------|-------------------------|-------------------------|
 * | 0    | CallEmergency           | moderncallemergency     |
 * | 1    | CallHigh                | moderncallhigh          |
 * | 2    | CallMedium              | moderncallmedium        |
 * | 3    | CallLow                 | moderncalllow           |
 * | 4    | Notifiation             | modernnotification      |
 * | 5    | Message                 | modernmessage           |
 * | 6    | Beep                    | modernnotification      |
 * | 7    | ModernCallEmergency     | moderncallemergency     |
 * | 8    | ModernCallHigh          | moderncallhigh          |
 * | 9    | ModernCallMedium        | moderncallmedium        |
 * | 10   | ModernCallLow           | moderncalllow           |
 * | 11   | ModernNotification      | modernnotification      |
 * | 12   | ModernMessage           | modernmessage           |
 * | 13   | ModernChat              | modernchat              |
 * | 14   | ModernCallUpdated       | moderncallupdated       |
 * | 15   | ModernCallClosed        | moderncallclosed        |
 * | 16   | ModernTroubleAlert      | moderntroublealert      |
 * | 17   | ModernPersonnelStatus   | modernpersonnelstatus   |
 * | 18   | ModernUnitStatus        | modernunitstatus        |
 * | 19   | ModernStaffing          | modernstaffing          |
 * | 20   | ModernShift             | modernshift             |
 * | 21   | ModernTraining          | moderntraining          |
 * | 22   | ModernCalendar          | moderncalendar          |
 * | 23   | ModernAvailabilityAlert | modernavailabilityalert |
 * | 24   | ModernWeatherAlert      | modernweatheralert      |
 * | 25   | ModernUnitNotice        | modernunitnotice        |
 * | 26   | ModernResourceOrder     | modernresourceorder     |
 */
export const PUSH_SOUND_TYPE_SOUNDS: Readonly<Record<PushSoundTypeValue, ModernSound>> = {
  0: 'moderncallemergency',
  1: 'moderncallhigh',
  2: 'moderncallmedium',
  3: 'moderncalllow',
  4: 'modernnotification',
  5: 'modernmessage',
  6: 'modernnotification',
  7: 'moderncallemergency',
  8: 'moderncallhigh',
  9: 'moderncallmedium',
  10: 'moderncalllow',
  11: 'modernnotification',
  12: 'modernmessage',
  13: 'modernchat',
  14: 'moderncallupdated',
  15: 'moderncallclosed',
  16: 'moderntroublealert',
  17: 'modernpersonnelstatus',
  18: 'modernunitstatus',
  19: 'modernstaffing',
  20: 'modernshift',
  21: 'moderntraining',
  22: 'moderncalendar',
  23: 'modernavailabilityalert',
  24: 'modernweatheralert',
  25: 'modernunitnotice',
  26: 'modernresourceorder',
};

/**
 * Channel ids the legacy apps created besides the sound types, kept because older server paths and the legacy
 * Firebase pipeline target them: `calls` (generic call, the Unit baseline sound), `notif`, `message`.
 */
export const EXTRA_CHANNEL_SOUNDS = {
  calls: 'modernnotification',
  notif: 'modernnotification',
  message: 'modernmessage',
} as const satisfies Record<string, ModernSound>;

/**
 * iOS plays the APNs `sound.name` from the app bundle; Core names a classic type by its historical file
 * (`NovuProvider.GetSoundFileNameFromType`: 0 `callemergency.wav` … 5 `message.wav`, and `{type}.wav` for anything it
 * cannot name, i.e. `6.wav` for Beep). The config plugin bundles the MODERN sound under each of those names (iOS only:
 * Android channels set their own sound, and `6` is not a valid Android resource name), so classic types play modern
 * sounds on iOS as well. Modern types (7+) and custom tones are bundled under their own names.
 */
export const IOS_SERVER_SOUND_ALIASES = {
  callemergency: 'moderncallemergency',
  callhigh: 'moderncallhigh',
  callmedium: 'moderncallmedium',
  calllow: 'moderncalllow',
  notification: 'modernnotification',
  message: 'modernmessage',
  '6': 'modernnotification',
} as const satisfies Record<string, ModernSound>;

const MODERN_SOUND_SET: ReadonlySet<string> = new Set(MODERN_SOUNDS);

export const isModernSound = (value: unknown): value is ModernSound => typeof value === 'string' && MODERN_SOUND_SET.has(value);

export const isCustomTone = (value: unknown): value is CustomTone => {
  if (typeof value !== 'string') return false;
  const match = /^c(\d{1,2})$/.exec(value);
  if (!match) return false;
  const tone = Number(match[1]);
  return tone >= 1 && tone <= CUSTOM_TONE_COUNT && String(tone) === match[1];
};

const isPushSoundTypeValue = (value: number): value is PushSoundTypeValue => Object.prototype.hasOwnProperty.call(PUSH_SOUND_TYPE_SOUNDS, value);

/**
 * The sound for a server sound type / channel id as Core sends it (`"0"`–`"26"`, `"c1"`–`"c25"`, `calls`, `notif`,
 * `message`). Null for anything else.
 */
export const soundForSoundType = (type: unknown): NotificationSound | null => {
  if (typeof type === 'number') {
    return Number.isInteger(type) && isPushSoundTypeValue(type) ? PUSH_SOUND_TYPE_SOUNDS[type] : null;
  }
  if (typeof type !== 'string') return null;
  const value = type.trim();
  if (/^\d{1,2}$/.test(value)) {
    const numeric = Number(value);
    return String(numeric) === value && isPushSoundTypeValue(numeric) ? PUSH_SOUND_TYPE_SOUNDS[numeric] : null;
  }
  const lower = value.toLowerCase();
  if (isCustomTone(lower)) return lower;
  if (Object.prototype.hasOwnProperty.call(EXTRA_CHANNEL_SOUNDS, lower)) return EXTRA_CHANNEL_SOUNDS[lower as keyof typeof EXTRA_CHANNEL_SOUNDS];
  return null;
};
