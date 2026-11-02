/**
 * When the member last touched the app (epoch ms), in memory only. The app shell records touches (throttled) from its
 * frame; the wall-display update rule reads it to restart only after the screen has been left alone. Starts at module
 * load, so an untouched app counts as idle since launch.
 */
let lastUserActivityAt = Date.now();

export function recordUserActivity(now: number = Date.now()): void {
  if (now > lastUserActivityAt) {
    lastUserActivityAt = now;
  }
}

export function getLastUserActivityAt(): number {
  return lastUserActivityAt;
}

/** Test helper. Not for app code. */
export function resetUserActivityForTests(now: number = Date.now()): void {
  lastUserActivityAt = now;
}
