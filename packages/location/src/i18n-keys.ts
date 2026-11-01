import { translate } from '@resgrid/i18n';

/**
 * Translation keys this package uses (namespace `common`; `{{appName}}` is filled by i18n from the variant manifest).
 * The first five already exist; the `permission_*` keys are new and must be added to all ten `common` language files
 * (resgrid-i18n skill). Until they land, `translateOr` falls back to the English text below.
 */
export const LOCATION_I18N_KEYS = {
  trackingNotificationTitle: 'location.tracking_notification_title',
  trackingNotificationBody: 'location.tracking_notification_body',
  fixPermissionDenied: 'location.fix_permission_denied',
  fixServicesDisabled: 'location.fix_services_disabled',
  fixUnavailable: 'location.fix_unavailable',
  permissionForegroundTitle: 'location.permission_foreground_title',
  permissionForegroundMessage: 'location.permission_foreground_message',
  permissionBackgroundTitle: 'location.permission_background_title',
  permissionBackgroundMessage: 'location.permission_background_message',
  permissionBlockedMessage: 'location.permission_blocked_message',
  permissionOpenSettings: 'location.permission_open_settings',
  permissionContinue: 'location.permission_continue',
  permissionNotNow: 'location.permission_not_now',
} as const;

export type LocationI18nKey = (typeof LOCATION_I18N_KEYS)[keyof typeof LOCATION_I18N_KEYS];

/** English text for every key (the `en.json` values to add/keep). */
export const LOCATION_I18N_FALLBACKS: Record<LocationI18nKey, string> = {
  'location.tracking_notification_title': 'Location Tracking',
  'location.tracking_notification_body': 'Sharing your location with your department.',
  'location.fix_permission_denied': 'Location permission is required. Enable location access in your device settings and try again.',
  'location.fix_services_disabled': 'Location services are turned off. Turn them on in your device settings and try again.',
  'location.fix_unavailable': 'Could not get a location fix. Move to an area with a clearer view of the sky and try again.',
  'location.permission_foreground_title': 'Allow location access',
  'location.permission_foreground_message': '{{appName}} uses your location while the app is open to show where you are on the map and to share your position with your department.',
  'location.permission_background_title': 'Allow location all the time',
  'location.permission_background_message':
    'To keep your department updated while {{appName}} is in the background or the screen is off, allow location access "All the time" (Android: "Allow all the time"; iOS: "Always") in the next prompt or in Settings.',
  'location.permission_blocked_message': 'Location access is turned off for {{appName}}. Open Settings to allow it.',
  'location.permission_open_settings': 'Open Settings',
  'location.permission_continue': 'Continue',
  'location.permission_not_now': 'Not now',
};

const interpolate = (text: string, values: Record<string, string>): string => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => values[name] ?? match);

/**
 * `translate(key)` with the English fallback when i18n is not initialised (headless background launch, tests) or the
 * key is missing (returns the key itself).
 */
export function translateOr(key: LocationI18nKey, values: Record<string, string> = {}): string {
  let translated: string | null = null;
  try {
    const value = Object.keys(values).length > 0 ? translate(key, values) : translate(key);
    translated = typeof value === 'string' && value.length > 0 && value !== key && value !== 'undefined' ? value : null;
  } catch {
    translated = null;
  }
  return translated ?? interpolate(LOCATION_I18N_FALLBACKS[key], { appName: 'Resgrid', ...values });
}
