import type { LocationOptions, LocationTaskOptions } from 'expo-location';

import type { TransmissionTarget } from './types';

/**
 * Accuracy profiles (omni-plan §7.7). Values are expo-location enums written as numbers so this module never loads the
 * native module: `Accuracy.Balanced` = 3, `ActivityType.Other` = 1, `ActivityType.AutomotiveNavigation` = 2.
 *
 * - `personal` (Responder, a phone in a pocket): the OS task alone delivers fixes once it is registered — a watcher
 *   alongside it only doubles location requests and JS work per fix. iOS keeps distance filters (it keeps timers alive
 *   under background location, so the heartbeat timer covers a stationary responder); Android drops them and delivers a
 *   batch every 30 s, moving or not, because it pauses JS timers in the background.
 * - `automotive` (Unit, a vehicle-mounted device): paced at one fix per ~25–30 s with no distance filter so a parked
 *   unit keeps delivering (the gate turns those into the keep-alive), `AutomotiveNavigation` so iOS tunes the GPS duty
 *   cycle for road travel, and a foreground watcher kept alongside the task for a responsive map (task fixes are ignored
 *   while it runs).
 *
 * Both: `pausesUpdatesAutomatically: false` (iOS would otherwise stop updates for a parked apparatus and only resume on
 * significant motion — it drops off dispatch's map) and the iOS background indicator stays lit (the user is entitled to
 * see they are tracked).
 */
export type LocationProfileId = 'personal' | 'automotive';

const ACCURACY_BALANCED = 3;
const ACTIVITY_OTHER = 1;
const ACTIVITY_AUTOMOTIVE = 2;

export interface LocationProfile {
  id: LocationProfileId;
  /** Keep a foreground watcher running while the background task is registered (task fixes ignored meanwhile). */
  watcherWithTask: boolean;
  watcherOptions: LocationOptions;
  taskOptions: (platform: string) => Omit<LocationTaskOptions, 'foregroundService'>;
}

const WATCHER_OPTIONS: LocationOptions = { accuracy: ACCURACY_BALANCED, timeInterval: 15_000, distanceInterval: 10 };

export const LOCATION_PROFILES: Record<LocationProfileId, LocationProfile> = {
  personal: {
    id: 'personal',
    watcherWithTask: false,
    watcherOptions: WATCHER_OPTIONS,
    taskOptions: (platform) => ({
      accuracy: ACCURACY_BALANCED,
      timeInterval: 15_000,
      distanceInterval: platform === 'android' ? 0 : 10,
      deferredUpdatesInterval: 30_000,
      deferredUpdatesDistance: platform === 'android' ? 0 : 25,
      pausesUpdatesAutomatically: false,
      activityType: ACTIVITY_OTHER,
      showsBackgroundLocationIndicator: true,
    }),
  },
  automotive: {
    id: 'automotive',
    watcherWithTask: true,
    watcherOptions: WATCHER_OPTIONS,
    taskOptions: () => ({
      accuracy: ACCURACY_BALANCED,
      timeInterval: 30_000,
      distanceInterval: 0,
      deferredUpdatesInterval: 25_000,
      deferredUpdatesDistance: 0,
      pausesUpdatesAutomatically: false,
      activityType: ACTIVITY_AUTOMOTIVE,
      showsBackgroundLocationIndicator: true,
    }),
  },
};

/** Persons get the personal profile, units the automotive one. */
export const profileForTarget = (target: TransmissionTarget): LocationProfileId => (target === 'unit' ? 'automotive' : 'personal');

export interface ForegroundServiceText {
  notificationTitle: string;
  notificationBody: string;
}

/** Full task options for a profile; Android shows the foreground-service notification text. */
export const buildTaskOptions = (profile: LocationProfileId, platform: string, notification: ForegroundServiceText): LocationTaskOptions => ({
  ...LOCATION_PROFILES[profile].taskOptions(platform),
  foregroundService: { notificationTitle: notification.notificationTitle, notificationBody: notification.notificationBody },
});

/**
 * Whether the options TaskManager holds for the task already match `desired` (Unit). Only the keys we set are compared,
 * and booleans may round-trip through native storage as 0/1. TaskManager persists options with the registration, so a
 * change here (new profile, new notification language) only reaches installed apps through a re-registration.
 */
export const hasSameTaskOptions = (current: unknown, desired: unknown): boolean => {
  if (desired !== null && typeof desired === 'object') {
    if (current === null || typeof current !== 'object') return false;
    return Object.entries(desired as Record<string, unknown>).every(([key, value]) => hasSameTaskOptions((current as Record<string, unknown>)[key], value));
  }
  return current === desired || (typeof desired === 'boolean' && Number(current) === Number(desired));
};
