/**
 * Filters CallKit/ConnectionService mute actions before they reach LiveKit (Responder callkeep.service.*):
 * - a gate closed while a specialized PTT handset is connected,
 * - an external lock set by BLE PTT presses (HFP side effects),
 * - storm protection: actions closer than 500 ms apart are a faulty headset or HFP conflict; all are dropped and the
 *   block extends 800 ms past the last one.
 */
export const MUTE_STORM_INTERVAL_MS = 500;
export const MUTE_STORM_COOLDOWN_MS = 800;

export type MuteFilterDecision = 'forward' | 'gate-closed' | 'locked' | 'storm' | 'storm-cooldown';

export class CallKeepMuteFilter {
  private enabled = true;
  private ignoreUntil = 0;
  private lastEventAt = 0;
  private stormEndsAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  ignoreFor(durationMs: number): void {
    this.ignoreUntil = Math.max(this.ignoreUntil, this.now() + durationMs);
  }

  evaluate(): MuteFilterDecision {
    if (!this.enabled) return 'gate-closed';
    const now = this.now();
    if (now < this.ignoreUntil) return 'locked';
    const sinceLast = now - this.lastEventAt;
    this.lastEventAt = now;
    if (sinceLast < MUTE_STORM_INTERVAL_MS) {
      this.stormEndsAt = now + MUTE_STORM_COOLDOWN_MS;
      return 'storm';
    }
    if (now < this.stormEndsAt) {
      this.stormEndsAt = now + MUTE_STORM_COOLDOWN_MS;
      return 'storm-cooldown';
    }
    return 'forward';
  }

  reset(): void {
    this.enabled = true;
    this.ignoreUntil = 0;
    this.lastEventAt = 0;
    this.stormEndsAt = 0;
  }
}
