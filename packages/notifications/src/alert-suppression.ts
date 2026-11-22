/**
 * Quiet alerts (dispatchers-on-duty plan D6). A feature can hold back the alerts the app raises by itself while something
 * about the member calls for quiet — a dispatcher on break gets no foreground push banner or sound, no push modal, no
 * in-app notification sound and no alert toast, except what the suppressor lets through (the desk's own break pushes).
 *
 * Features register a suppressor; the foreground push presentation, the push modal, the in-app notification sound player
 * and the shell's alert-toast gate ask `isAlertSuppressed` before they alert. Feedback on something the member did (a
 * save, an error) is never an alert and is never held back. Background pushes the OS shows itself are out of reach here.
 */

/** Where an alert would show: the OS foreground presentation of a push, the in-app push modal, an in-app sound, an alert toast. */
export type AlertChannel = 'presentation' | 'modal' | 'sound' | 'toast';

export interface AlertDescriptor {
  channel: AlertChannel;
  /** The push event code (`C1234`, `DB:…`), when the alert comes from a push. */
  eventCode?: string | null;
  /** The notification kind (`call`, `deskBreak`…), when known. */
  kind?: string | null;
}

/** True when this alert should not be shown or heard now. */
export type AlertSuppressor = (alert: AlertDescriptor) => boolean;

const suppressors = new Map<string, AlertSuppressor>();

/** Adds (or replaces) a suppressor under `id`. Returns a function that removes it again. */
export const registerAlertSuppressor = (id: string, suppressor: AlertSuppressor): (() => void) => {
  suppressors.set(id, suppressor);

  return () => {
    if (suppressors.get(id) === suppressor) suppressors.delete(id);
  };
};

/** Whether any registered suppressor holds this alert back. A suppressor that throws never silences anything. */
export const isAlertSuppressed = (alert: AlertDescriptor): boolean => {
  for (const suppressor of suppressors.values()) {
    try {
      if (suppressor(alert)) return true;
    } catch {
      // A broken suppressor must not swallow a call alert.
    }
  }

  return false;
};

/** Test hook. */
export const clearAlertSuppressorsForTests = (): void => {
  suppressors.clear();
};
