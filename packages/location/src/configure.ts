import type { ApiContext } from '@resgrid/api';
import { getActiveVariant, type VariantManifest } from '@resgrid/config';
import type { Logger } from '@resgrid/core';
import type { OutboxHandlerRegistry } from '@resgrid/offline';

import { resetLocationStores } from './location-store';
import { setLocationLogger } from './logger';
import { registerLocationOutboxHandlers } from './outbox-handlers';
import { setLocationTaskConsumer } from './task-runtime';
import { type LocationCapability, LocationTransmitter, type LocationTransmitterOptions } from './transmitter';

export interface ConfigureLocationOptions extends Omit<LocationTransmitterOptions, 'capability'> {
  /** Defaults to `getActiveVariant()` (set by the variant root layout — a headless bootstrap must set it or pass this). */
  manifest?: VariantManifest;
  /** Overrides `manifest.capabilities.location`. */
  capability?: LocationCapability;
  /** API context for the outbox handlers (read at send time). */
  getApiContext: () => ApiContext;
  /** `@resgrid/core`'s logger; without it the package logs nothing. */
  logger?: Logger;
  /** Register the target's outbox handler (default true). Set false when the shell registers handlers itself. */
  registerHandlers?: boolean;
  /** Defaults to the process-wide outbox handler registry. */
  handlerRegistry?: Pick<OutboxHandlerRegistry, 'register'>;
}

interface ActiveLocation {
  transmitter: LocationTransmitter;
  dispose: () => void;
}

let active: ActiveLocation | null = null;

/**
 * Composition root for location (call once from the app shell after `setActiveVariant` and `initOffline`, and from the
 * headless background bootstrap). Creates the transmitter for the variant's target, registers the target's outbox
 * handler, attaches the transmitter to the background task and to app state / session / settings. Calling it again
 * replaces the previous instance.
 */
export function configureLocation(options: ConfigureLocationOptions): LocationTransmitter {
  if (options.logger) setLocationLogger(options.logger);
  disposeLocation();

  const capability = options.capability ?? (options.manifest ?? getActiveVariant()).capabilities.location;
  const transmitter = new LocationTransmitter({ ...options, capability });
  const target = capability.transmission;
  const unregisterHandlers =
    options.registerHandlers !== false && target !== 'none'
      ? registerLocationOutboxHandlers({
          getApiContext: options.getApiContext,
          targets: [target],
          registry: options.handlerRegistry,
          onDelivered: (handlerTarget, event) => active?.transmitter.notifyDelivered(handlerTarget, event),
          onRejected: (handlerTarget, event, reason) => active?.transmitter.notifyRejected(handlerTarget, event, reason),
        })
      : () => undefined;

  active = {
    transmitter,
    dispose: () => {
      transmitter.dispose();
      unregisterHandlers();
    },
  };
  setLocationTaskConsumer(transmitter);
  transmitter.attach();
  return transmitter;
}

/** The configured transmitter, or null before `configureLocation`. */
export function getLocationTransmitter(): LocationTransmitter | null {
  return active?.transmitter ?? null;
}

/** Detach the transmitter (listeners, task consumer, handlers). Does not stop a registered OS task — `stop()` does. */
export function disposeLocation(): void {
  if (!active) return;
  const current = active;
  active = null;
  setLocationTaskConsumer(null);
  current.dispose();
}

/** Test helper. */
export function resetLocationForTests(): void {
  disposeLocation();
  resetLocationStores();
}
