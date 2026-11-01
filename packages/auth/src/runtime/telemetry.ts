/**
 * Error-reporting user seam. The app shell passes `setSentryUser` from `@resgrid/core`; only the opaque user id is ever
 * sent (never the username or name — Unit and Responder sent both).
 */
export type TelemetryUserSetter = (userId: string | null) => void;

let setter: TelemetryUserSetter | null = null;

export function setTelemetryUserSetter(next: TelemetryUserSetter | null): void {
  setter = next;
}

export function identifyTelemetryUser(userId: string | null): void {
  try {
    setter?.(userId);
  } catch {
    // Reporting must never break sign-in or sign-out.
  }
}
