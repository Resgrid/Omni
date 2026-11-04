import { z } from 'zod';

/**
 * Android: with Google's Location Accuracy off, a location request opens Google Play services' dialog asking to turn it
 * on (expo-location's `mayShowUserSettingsDialog`, on by default; ignored on iOS and web). The dialog is another app's
 * activity, so it sends the app to the background, and the transmitter re-subscribes its watcher on the way back: with
 * the option left on, that opened the dialog again, and a user who declined it could not get back into the app. The app
 * asks once per process; after a decline, requests run on the device's location as it is.
 */

/** expo-location's rejection of a request whose settings dialog the user declined. */
export const SettingsDialogDeclinedSchema = z.object({ code: z.literal('ERR_LOCATION_SETTINGS_UNSATISFIED') });

let declined = false;

/** Whether the next request may show the dialog (pass as `mayShowUserSettingsDialog`). */
export const maySettingsDialogShow = (): boolean => !declined;

/** The user declined the dialog: later requests go ahead without it. */
export function noteSettingsDialogDeclined(): void {
  declined = true;
}

export function resetSettingsDialogForTests(): void {
  declined = false;
}
