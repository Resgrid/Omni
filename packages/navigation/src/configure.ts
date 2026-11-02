import { type ApiContext, recordDeviation } from '@resgrid/api';
import { beginSpeechDucking, endSpeechDucking } from '@resgrid/core/device/native-device';
import { logger } from '@resgrid/core/logging/logger';
import { translate } from '@resgrid/i18n';
import { getCurrentLocation, getLocationTransmitter } from '@resgrid/location';
import { RouteDeviationType } from '@resgrid/models';
import { type DurableKv, type OutboxHandler, readLegacyString, registerOutboxHandler, registerPreservedKeys } from '@resgrid/offline';
import * as Speech from 'expo-speech';

import type { NavFix } from './engine/progress';
import { createDuckingVoice } from './store/ducking-voice';
import { navigationProgressHandler, submitNavigationProgress } from './store/progress-reports';
import { createServerRouteSource } from './store/route-sources';
import { type NavigationPreferences, setNavigationServices } from './store/services';

/** Device preferences (they describe the device and the crew's habit, not the user, so logout keeps them). */
export const NAVIGATION_VOICE_MUTED_KEY = 'NAVIGATION_VOICE_MUTED';
export const NAVIGATION_SAFETY_NOTICE_KEY = 'NAVIGATION_SAFETY_NOTICE_ACK';

export interface ConfigureNavigationOptions {
  getApiContext: () => ApiContext | null;
  /** App language (`en`, `de`…): instructions and speech. */
  getLanguage: () => string;
  /** Metric guidance; the device locale decides when the department has not. */
  isMetric: () => boolean;
  /** Config `RoutingSupportsTraffic`. */
  supportsTraffic: () => boolean;
  /** Device preference storage (the app's main durable KV); null keeps preferences in memory. */
  storage: DurableKv | null;
  /** Arrival radius from the department (setting 122) once the server sends it; 0 = default. */
  getArrivalRadiusMeters?: () => number;
}

const kvPreferences = (storage: DurableKv | null): NavigationPreferences => {
  let muted = storage ? readLegacyString(storage, NAVIGATION_VOICE_MUTED_KEY) === 'true' : false;
  let acknowledged = storage ? readLegacyString(storage, NAVIGATION_SAFETY_NOTICE_KEY) === 'true' : false;
  return {
    isMuted: () => muted,
    setMuted: (value) => {
      muted = value;
      storage?.set(NAVIGATION_VOICE_MUTED_KEY, value ? 'true' : 'false');
    },
    hasAcknowledgedSafetyNotice: () => acknowledged,
    acknowledgeSafetyNotice: () => {
      acknowledged = true;
      storage?.set(NAVIGATION_SAFETY_NOTICE_KEY, 'true');
    },
  };
};

const currentFix = (): NavFix | null => {
  const location = getCurrentLocation();
  if (!location) return null;
  return { latitude: location.latitude, longitude: location.longitude, heading: location.heading, speed: location.speed, accuracy: location.accuracy, timestamp: location.timestamp };
};

let disposeHandler: (() => void) | null = null;

/**
 * Wires the navigation session to the app (MapLibre plan §9): server routes, expo-speech prompts (SpeechSynthesis on
 * web) that lower other audio while they play, device preferences, ETA reports through the outbox, OffRoute deviations, the device position and the
 * `navigation` location profile. Call once at startup for variants with in-app navigation (`maps.navigationInApp`).
 */
export function configureNavigation(options: ConfigureNavigationOptions): () => void {
  registerPreservedKeys([NAVIGATION_VOICE_MUTED_KEY, NAVIGATION_SAFETY_NOTICE_KEY]);
  disposeHandler?.();
  // Typed handlers register into the untyped registry (offline's method-syntax contract).
  disposeHandler = registerOutboxHandler(navigationProgressHandler as unknown as OutboxHandler);

  setNavigationServices({
    routes: createServerRouteSource(options),
    // Other apps' audio dips while a prompt plays (never during a call or push-to-talk: the native side refuses).
    voice: createDuckingVoice(
      {
        speak: (text, onFinished) => Speech.speak(text, { language: options.getLanguage(), onDone: onFinished, onStopped: onFinished, onError: onFinished }),
        stop: () => {
          void Speech.stop();
        },
      },
      { begin: beginSpeechDucking, end: endSpeechDucking }
    ),
    preferences: kvPreferences(options.storage),
    reportProgress: (report) => {
      submitNavigationProgress(report).catch((error: unknown) => logger.warn({ message: 'Could not queue a navigation ETA report', context: { reason: error instanceof Error ? error.name : typeof error } }));
    },
    recordOffRoute: ({ routeInstanceId, latitude, longitude, distanceMeters }) => {
      const ctx = options.getApiContext();
      if (!ctx) return;
      recordDeviation(ctx, { RouteInstanceId: routeInstanceId, DeviationType: RouteDeviationType.OffRoute, Latitude: latitude, Longitude: longitude, DistanceMeters: Math.round(distanceMeters) }).catch((error: unknown) =>
        logger.warn({ message: 'Could not record an off-route deviation', context: { reason: error instanceof Error ? error.name : typeof error } })
      );
    },
    currentFix,
    arrivalRadiusMeters: () => options.getArrivalRadiusMeters?.() ?? 0,
    onSessionChange: (active, destinationName) => {
      const notificationBody = active ? (destinationName ? translate('navigation.voice.navigating_to', { name: destinationName }) : translate('navigation.voice.navigating')) : null;
      void getLocationTransmitter()
        ?.setNavigationActive(active, { notificationBody })
        .catch((error: unknown) => logger.warn({ message: 'Could not switch the location profile for navigation', context: { reason: error instanceof Error ? error.name : typeof error } }));
    },
    text: (key, values) => translate(`navigation.voice.${key}`, values),
    // Positions and destinations never go to the log.
    log: (level, message, error) => logger[level]({ message, context: { reason: error instanceof Error ? error.name : typeof error } }),
    now: () => Date.now(),
  });

  return () => {
    disposeHandler?.();
    disposeHandler = null;
  };
}
