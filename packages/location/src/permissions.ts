import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { LOCATION_I18N_KEYS, translateOr } from './i18n-keys';
import { describeError, getLocationLogger } from './logger';
import { settleWithin, TIMED_OUT } from './timeouts';
import type { LocationPermissionStatus } from './types';
import { BROWSER_PERMISSION_DENIED, getBrowserGeolocation, getBrowserPosition, queryBrowserPermission } from './web-geolocation';

/**
 * Generous, because it covers the user reading the OS prompt. It exists for the request that never settles: on
 * Android a permission request made outside Expo that overlaps an Expo one takes the activity's single result callback
 * and Expo holds every later request behind it until the process restarts. Reporting that as denied points the user at
 * Settings, where a grant is read back without a prompt (Responder).
 */
export const PERMISSION_TIMEOUT_MS = 30_000;

export interface PermissionAnswer {
  status: LocationPermissionStatus;
  /** False once the user hard-denied: prompting again is a no-op, send them to Settings. */
  canAskAgain: boolean;
}

export interface LocationPermissionSnapshot {
  foreground: PermissionAnswer;
  background: PermissionAnswer;
}

const UNSUPPORTED: PermissionAnswer = { status: 'denied', canAskAgain: false };

const isWebPlatform = (): boolean => Platform.OS === 'web';

/** expo-location answers carry the `PermissionStatus` enum; normalise without depending on its runtime value. */
const toAnswer = (response: { status: unknown; granted?: boolean; canAskAgain?: boolean }): PermissionAnswer => {
  const raw = String(response.status);
  const status: LocationPermissionStatus = response.granted === true || raw === 'granted' ? 'granted' : raw === 'denied' ? 'denied' : 'undetermined';
  return { status, canAskAgain: response.canAskAgain !== false };
};

const browserAnswer = async (): Promise<PermissionAnswer> => {
  if (!getBrowserGeolocation()) return UNSUPPORTED;
  const status = (await queryBrowserPermission()) ?? 'undetermined';
  return { status, canAskAgain: status !== 'denied' };
};

/** Current grants, never prompting. Background is `denied`/unsupported on web. */
export async function getLocationPermissions(): Promise<LocationPermissionSnapshot> {
  if (isWebPlatform()) return { foreground: await browserAnswer(), background: UNSUPPORTED };
  const [foreground, background] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()]);
  return { foreground: toAnswer(foreground), background: toAnswer(background) };
}

export async function getForegroundLocationPermission(): Promise<PermissionAnswer> {
  if (isWebPlatform()) return browserAnswer();
  return toAnswer(await Location.getForegroundPermissionsAsync());
}

export async function getBackgroundLocationPermission(): Promise<PermissionAnswer> {
  if (isWebPlatform()) return UNSUPPORTED;
  return toAnswer(await Location.getBackgroundPermissionsAsync());
}

const timedRequest = async (request: () => Promise<PermissionAnswer>, label: string): Promise<PermissionAnswer> => {
  try {
    const answer = await settleWithin(request(), PERMISSION_TIMEOUT_MS);
    if (answer === TIMED_OUT) {
      getLocationLogger().warn({ message: 'Location permission request did not settle; reporting it as denied', context: { step: label } });
      return { status: 'denied', canAskAgain: false };
    }
    return answer;
  } catch (error) {
    getLocationLogger().warn({ message: 'Location permission request failed', context: { step: label, error: describeError(error) } });
    return { status: 'denied', canAskAgain: false };
  }
};

/**
 * Step 1 — "when in use". Prompts only while the decision is still open (`canAskAgain`); a hard denial is reported as
 * is. On web, asking for one position is what triggers the browser prompt.
 */
export async function requestForegroundLocationPermission(): Promise<PermissionAnswer> {
  if (isWebPlatform()) {
    const geolocation = getBrowserGeolocation();
    if (!geolocation) return UNSUPPORTED;
    const current = await browserAnswer();
    if (current.status !== 'undetermined') return current;
    return timedRequest(async () => {
      try {
        await getBrowserPosition(geolocation, { enableHighAccuracy: false, maximumAge: 60_000, timeout: PERMISSION_TIMEOUT_MS });
        return { status: 'granted', canAskAgain: true };
      } catch (error) {
        const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
        if (code === BROWSER_PERMISSION_DENIED) return { status: 'denied', canAskAgain: false };
        // Timeout or unavailable position: the permission itself may well be granted.
        return (await queryBrowserPermission()) === 'granted' ? { status: 'granted', canAskAgain: true } : { status: 'undetermined', canAskAgain: true };
      }
    }, 'foreground');
  }
  return timedRequest(async () => {
    const current = toAnswer(await Location.getForegroundPermissionsAsync());
    if (current.status === 'granted' || !current.canAskAgain) return current;
    return toAnswer(await Location.requestForegroundPermissionsAsync());
  }, 'foreground');
}

/**
 * Step 2 — "always". Only after "when in use" is granted (iOS shows the upgrade prompt, Android 11+ opens the app's
 * location settings page). Never call it from a resume or a timer: it must follow the user's own action.
 */
export async function requestBackgroundLocationPermission(): Promise<PermissionAnswer> {
  if (isWebPlatform()) return UNSUPPORTED;
  const foreground = toAnswer(await Location.getForegroundPermissionsAsync());
  if (foreground.status !== 'granted') return { status: 'denied', canAskAgain: foreground.canAskAgain };
  return timedRequest(async () => {
    const current = toAnswer(await Location.getBackgroundPermissionsAsync());
    if (current.status === 'granted' || !current.canAskAgain) return current;
    return toAnswer(await Location.requestBackgroundPermissionsAsync());
  }, 'background');
}

/**
 * - `granted`: everything asked for is allowed.
 * - `foreground-only`: "when in use" granted, "always" refused — tracking runs while the app is open.
 * - `denied`: refused, but the user can still be asked (e.g. dismissed the prompt).
 * - `blocked`: refused and the OS will not prompt again — show the Settings rationale.
 * - `unsupported`: no location on this platform (browser without geolocation; background on web).
 */
export type LocationPermissionOutcome = 'granted' | 'foreground-only' | 'denied' | 'blocked' | 'unsupported';

export interface LocationPermissionFlowResult {
  outcome: LocationPermissionOutcome;
  foreground: PermissionAnswer;
  background: PermissionAnswer | null;
}

export interface LocationPermissionFlowOptions {
  /** Also ask for "always" (variants with background location, when the user enabled it). */
  background: boolean;
  /** False: only read the grants (resume, startup without user action). Default true. */
  prompt?: boolean;
}

/** The two-step flow: "when in use" first, then — only if granted and wanted — "always". */
export async function runLocationPermissionFlow(options: LocationPermissionFlowOptions): Promise<LocationPermissionFlowResult> {
  const prompt = options.prompt !== false;
  if (isWebPlatform() && !getBrowserGeolocation()) return { outcome: 'unsupported', foreground: UNSUPPORTED, background: null };

  const foreground = prompt ? await requestForegroundLocationPermission() : await getForegroundLocationPermission();
  if (foreground.status !== 'granted') {
    return { outcome: foreground.canAskAgain ? 'denied' : 'blocked', foreground, background: null };
  }
  if (!options.background) return { outcome: 'granted', foreground, background: null };
  if (isWebPlatform()) return { outcome: 'foreground-only', foreground, background: UNSUPPORTED };

  const background = prompt ? await requestBackgroundLocationPermission() : await getBackgroundLocationPermission();
  return { outcome: background.status === 'granted' ? 'granted' : 'foreground-only', foreground, background };
}

export type LocationRationaleStep = 'foreground' | 'background' | 'blocked';

export interface LocationPermissionRationale {
  title: string;
  message: string;
  /** Primary action: continue to the OS prompt, or open Settings for `blocked`. */
  confirmLabel: string;
  cancelLabel: string;
}

/**
 * Text for the in-app explanation shown before each OS prompt (and when the OS will not prompt any more). The UI shows
 * it with `@resgrid/ui` primitives; opening Settings is the caller's job (`Linking.openSettings()`).
 */
export function getLocationPermissionRationale(step: LocationRationaleStep): LocationPermissionRationale {
  const notNow = translateOr(LOCATION_I18N_KEYS.permissionNotNow);
  if (step === 'background') {
    return {
      title: translateOr(LOCATION_I18N_KEYS.permissionBackgroundTitle),
      message: translateOr(LOCATION_I18N_KEYS.permissionBackgroundMessage),
      confirmLabel: translateOr(LOCATION_I18N_KEYS.permissionContinue),
      cancelLabel: notNow,
    };
  }
  if (step === 'blocked') {
    return {
      title: translateOr(LOCATION_I18N_KEYS.permissionForegroundTitle),
      message: translateOr(LOCATION_I18N_KEYS.permissionBlockedMessage),
      confirmLabel: translateOr(LOCATION_I18N_KEYS.permissionOpenSettings),
      cancelLabel: notNow,
    };
  }
  return {
    title: translateOr(LOCATION_I18N_KEYS.permissionForegroundTitle),
    message: translateOr(LOCATION_I18N_KEYS.permissionForegroundMessage),
    confirmLabel: translateOr(LOCATION_I18N_KEYS.permissionContinue),
    cancelLabel: notNow,
  };
}
