import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { toLocationFix } from './geo';
import { LOCATION_I18N_KEYS, translateOr } from './i18n-keys';
import { setCurrentLocation } from './location-store';
import { describeError, getLocationLogger } from './logger';
import { PERMISSION_TIMEOUT_MS, requestForegroundLocationPermission } from './permissions';
import { settleWithin, TIMED_OUT } from './timeouts';
import type { LocationFix } from './types';
import { getBrowserGeolocation, getBrowserPosition } from './web-geolocation';

/**
 * On-demand fix for a status submission that needs coordinates (Responder baseline; Unit's copy is older). The
 * continuous watcher only runs while tracking and its store is not persisted, so a submission cannot assume anything is
 * cached: it asks at the moment it needs one, which is also what makes a GPS-required status enforceable.
 *
 * Every native call is bounded: a submission waits on this whole function, and one that never settles would leave the
 * sheet on "Submitting…" until the app is killed. `getCurrentPositionAsync` has no timeout of its own — indoors it can
 * sit on the request until the OS gives up, which on Android is effectively never.
 */
export type LocationFixOutcome = 'acquired' | 'permission-denied' | 'services-disabled' | 'unavailable';

export interface LocationFixResult {
  outcome: LocationFixOutcome;
  location: LocationFix | null;
}

export const FIX_TIMEOUT_MS = 8_000;
/** Quick reads of device state; anything slower is a stuck native call. */
const SERVICES_CHECK_TIMEOUT_MS = 3_000;
const LAST_KNOWN_TIMEOUT_MS = 3_000;
/** A fix from the last minute is a fine answer for "where are you now" and costs no radio time. */
const LAST_KNOWN_MAX_AGE_MS = 60_000;
const ACCURACY_BALANCED = 3;

const readLiveFix = async (): Promise<LocationFix | null> => {
  const location = await settleWithin(
    Location.getCurrentPositionAsync({ accuracy: ACCURACY_BALANCED }).catch((error: unknown) => {
      getLocationLogger().warn({ message: 'Failed to acquire the current position', context: { error: describeError(error) } });
      return null;
    }),
    FIX_TIMEOUT_MS
  );
  return location === TIMED_OUT ? null : toLocationFix(location);
};

const readLastKnown = async (): Promise<LocationFix | null> => {
  try {
    const location = await settleWithin(Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }), LAST_KNOWN_TIMEOUT_MS);
    if (location === TIMED_OUT) {
      getLocationLogger().warn({ message: 'Reading the last known position did not settle' });
      return null;
    }
    return toLocationFix(location);
  } catch (error) {
    getLocationLogger().warn({ message: 'Failed to read the last known position', context: { error: describeError(error) } });
    return null;
  }
};

const acquireBrowserFix = async (): Promise<LocationFixResult> => {
  const geolocation = getBrowserGeolocation();
  if (!geolocation) return { outcome: 'unavailable', location: null };
  try {
    const fix = await getBrowserPosition(geolocation, { enableHighAccuracy: false, maximumAge: LAST_KNOWN_MAX_AGE_MS, timeout: Math.max(FIX_TIMEOUT_MS, PERMISSION_TIMEOUT_MS) });
    setCurrentLocation(fix, 'on-demand');
    return { outcome: 'acquired', location: fix };
  } catch (error) {
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    return { outcome: code === 1 ? 'permission-denied' : 'unavailable', location: null };
  }
};

/**
 * Ask for a position, prompting for "when in use" if it is still undecided. `permission-denied` and `unavailable` stay
 * apart because they are different problems for the user: a trip to Settings versus a walk to a window.
 */
export async function acquireLocationFix(): Promise<LocationFixResult> {
  if (Platform.OS === 'web') return acquireBrowserFix();

  const permission = await requestForegroundLocationPermission();
  if (permission.status !== 'granted') {
    getLocationLogger().info({ message: 'Location fix requested without permission', context: { status: permission.status, canAskAgain: permission.canAskAgain } });
    return { outcome: 'permission-denied', location: null };
  }

  // Permission can be granted while location services are off entirely; the position call then fails exactly like
  // "no signal" unless we check.
  try {
    const servicesEnabled = await settleWithin(Location.hasServicesEnabledAsync(), SERVICES_CHECK_TIMEOUT_MS);
    if (servicesEnabled === TIMED_OUT) {
      getLocationLogger().warn({ message: 'Checking whether location services are enabled did not settle' });
    } else if (!servicesEnabled) {
      return { outcome: 'services-disabled', location: null };
    }
  } catch (error) {
    // An unanswerable check counts as "probably fine": the position attempt decides.
    getLocationLogger().warn({ message: 'Failed to check whether location services are enabled', context: { error: describeError(error) } });
  }

  // A timed-out live fix is common indoors; a recent cached one is still truthful and better than refusing outright.
  const location = (await readLiveFix()) ?? (await readLastKnown());
  if (!location) return { outcome: 'unavailable', location: null };

  // Feeding the store is a side benefit; it must never turn a real fix into a refusal.
  try {
    setCurrentLocation(location, 'on-demand');
  } catch (error) {
    getLocationLogger().warn({ message: 'Failed to record the acquired fix locally', context: { error: describeError(error) } });
  }
  return { outcome: 'acquired', location };
}

const FIX_ERROR_KEYS = {
  'permission-denied': LOCATION_I18N_KEYS.fixPermissionDenied,
  'services-disabled': LOCATION_I18N_KEYS.fixServicesDisabled,
  unavailable: LOCATION_I18N_KEYS.fixUnavailable,
} as const;

/** Message naming the specific obstacle ("turn location services on"), not just "GPS is required". */
export function getLocationFixErrorMessage(outcome: Exclude<LocationFixOutcome, 'acquired'>): string {
  return translateOr(FIX_ERROR_KEYS[outcome]);
}
