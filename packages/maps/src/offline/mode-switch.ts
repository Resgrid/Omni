import type { MapLoadErrorKind } from './types';

/** More than this many tile/source errors … */
export const OFFLINE_SWITCH_ERROR_THRESHOLD = 5;
/** … within this window switch the maps to the local style (D16). */
export const OFFLINE_SWITCH_ERROR_WINDOW_MS = 30_000;
/** After a switch, connectivity must be back (and stay) for this long before the maps go online again. */
export const OFFLINE_SWITCH_STABLE_MS = 30_000;
/** Errors again soon after going back online double the hold (30 s, 1 min, 2 min…) up to this, so maps do not flap. */
export const OFFLINE_SWITCH_MAX_HOLD_MS = 10 * 60_000;
const REPEAT_TRIP_WINDOW_MS = 2 * 60_000;

export interface OfflineModeSwitchOptions {
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * The online/offline decision of the D16 mode switch (MapLibre plan §19.5), separate from the packs:
 * - connectivity lost → offline at once;
 * - more than 5 tile/source errors within 30 s while online → offline (the network is up but the tile host is not
 *   reachable: captive portal, tile outage); a style that fails to load at all switches at once;
 * - back online only after connectivity has been up for 30 s without a new loss (no flapping between styles); errors
 *   right after going back double the next hold, up to 10 minutes.
 * At start the reported connectivity is taken as is (no wait). Whether a local style exists is the caller's concern.
 */
export class OfflineModeSwitch {
  private connected: boolean;
  private held: boolean;
  private errors: number[] = [];
  private timer: unknown = null;
  /** Error trips in a row (each soon after the previous release); a connectivity loss resets it. */
  private trips = 0;
  private releasedAt: number | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(initiallyOnline: boolean, options: OfflineModeSwitchOptions = {}) {
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.connected = initiallyOnline;
    this.held = !initiallyOnline;
  }

  /** Maps may use the online style. */
  isOnline = (): boolean => this.connected && !this.held;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setConnectivity(online: boolean): void {
    const before = this.isOnline();
    if (online !== this.connected) {
      this.connected = online;
      if (!online) {
        this.held = true;
        this.errors = [];
        this.trips = 0;
        this.cancelTimer();
      }
    }
    // Back (or still) connected while held: release once it has stayed up for 30 s.
    if (online && this.held && this.timer === null) this.scheduleRelease();
    if (before !== this.isOnline()) this.emit();
  }

  reportError(kind: MapLoadErrorKind): void {
    if (!this.isOnline()) return;
    const now = this.now();
    this.errors = [...this.errors.filter((at) => now - at < OFFLINE_SWITCH_ERROR_WINDOW_MS), now];
    if (kind === 'style' || this.errors.length > OFFLINE_SWITCH_ERROR_THRESHOLD) {
      this.trips = this.releasedAt !== null && now - this.releasedAt < REPEAT_TRIP_WINDOW_MS ? this.trips + 1 : 1;
      this.held = true;
      this.errors = [];
      this.scheduleRelease(Math.min(OFFLINE_SWITCH_STABLE_MS * 2 ** (this.trips - 1), OFFLINE_SWITCH_MAX_HOLD_MS));
      this.emit();
    }
  }

  /** Stops the pending release timer (unmount); a later `setConnectivity(true)` schedules it again. */
  dispose(): void {
    this.cancelTimer();
  }

  private scheduleRelease(holdMs: number = OFFLINE_SWITCH_STABLE_MS): void {
    this.cancelTimer();
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (!this.connected) return;
      this.held = false;
      this.releasedAt = this.now();
      this.emit();
    }, holdMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}
