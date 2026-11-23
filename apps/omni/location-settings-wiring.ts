// Settings → Location takes effect at once. The location transmitter reads Realtime and Background Geolocation from the
// device preferences, but only when something makes it re-sync (sign-in, a resume); turning Background Geolocation on
// therefore registered the background task only at the next resume. `@resgrid/features/settings` tells every change
// through `subscribePreferences`, and the shell cannot import features (layering), so the app layer joins the two here.
import { logger } from '@resgrid/core';
import { subscribePreferences } from '@resgrid/features/settings';
import { getLocationTransmitter } from '@resgrid/location';

let unsubscribe: (() => void) | null = null;

/**
 * Re-syncs the transmitter whenever a device preference is saved. `refresh()` never prompts and does nothing while no
 * session is tracked, so a theme or navigation-app change costs one permission read. Idempotent; returns the undo.
 */
export function wireLocationSettings(): () => void {
  unsubscribe ??= subscribePreferences(() => {
    const transmitter = getLocationTransmitter();

    if (!transmitter) return;

    transmitter.refresh().catch(() => logger.warn({ message: 'Location did not follow a Settings change; it will on the next resume' }));
  });

  return () => {
    unsubscribe?.();
    unsubscribe = null;
  };
}
