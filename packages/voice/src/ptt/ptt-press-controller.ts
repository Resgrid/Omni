import { logger } from '@resgrid/core';

import { getCallKeepService } from '../callkeep/callkeep-service';
import { getMicrophoneController, type PttInputSource } from './microphone-controller';

/** Media buttons often never send key-up: a held press is released after this long without a repeat (Unit). */
export const MEDIA_PTT_RELEASE_FALLBACK_MS = 1400;
/** A press that arrives while the room is still connecting is retried after this delay instead of being dropped. */
export const MIC_APPLY_RETRY_MS = 160;
/** CallKit/HFP fires spurious mute actions around a hardware PTT press; they are ignored for this long. */
export const CALLKEEP_PTT_LOCK_MS = 1000;

/**
 * Press-and-hold state machine for hardware PTT inputs (Unit bluetooth-audio.service): de-duplicates repeated
 * press/release frames, serializes microphone changes (the latest request wins), retries while a room is connecting,
 * locks CallKeep mute actions around each press, and releases a stuck media-button press after a fallback timeout.
 */
export class PttPressController {
  private pressed = false;
  private releaseFallback: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryEnabled: boolean | null = null;
  private pendingEnabled: boolean | null = null;
  private applying = false;
  private idle: Promise<void> = Promise.resolve();

  constructor(private readonly source: PttInputSource) {}

  isPressed(): boolean {
    return this.pressed;
  }

  /** PTT key down. `kind: 'media'` arms the release fallback (AVRCP keys rarely report key-up). */
  press(kind: 'ble' | 'media' = 'ble'): void {
    if (this.pressed) {
      if (kind === 'media') this.armReleaseFallback();
      return;
    }
    this.pressed = true;
    if (kind === 'media') this.armReleaseFallback();
    else this.clearReleaseFallback();
    getCallKeepService().ignoreMuteEvents(CALLKEEP_PTT_LOCK_MS);
    this.request(true);
  }

  /** PTT key up. */
  release(): void {
    if (!this.pressed) return;
    this.pressed = false;
    this.clearReleaseFallback();
    getCallKeepService().ignoreMuteEvents(CALLKEEP_PTT_LOCK_MS);
    this.request(false);
  }

  /** Toggle-mode button (mute key, single media-button press). */
  async toggle(): Promise<void> {
    const controller = getMicrophoneController();
    if (!controller?.isActive()) return;
    try {
      await controller.toggleMicrophone(this.source);
    } catch (error) {
      logger.error({ message: 'Failed to toggle microphone from PTT input', context: { source: this.source, error } });
    }
  }

  /**
   * The input went away (disconnect, reset, destroy): a queued unmute is dropped, but a held press is released so the
   * microphone is never left transmitting after the handset that keyed it is gone.
   */
  reset(): void {
    const wasPressed = this.pressed;
    this.pressed = false;
    this.clearReleaseFallback();
    this.clearRetry();
    if (this.pendingEnabled === true) this.pendingEnabled = null;
    if (wasPressed) {
      getCallKeepService().ignoreMuteEvents(CALLKEEP_PTT_LOCK_MS);
      this.request(false);
    }
  }

  /** Resolves once queued microphone changes have been applied (tests, teardown). */
  whenIdle(): Promise<void> {
    return this.idle;
  }

  private request(enabled: boolean): void {
    this.pendingEnabled = enabled;
    if (this.applying) return;
    this.applying = true;
    this.idle = (async () => {
      try {
        while (this.pendingEnabled !== null) {
          const target = this.pendingEnabled;
          this.pendingEnabled = null;
          await this.apply(target);
        }
      } finally {
        this.applying = false;
      }
    })();
  }

  private async apply(enabled: boolean): Promise<void> {
    const controller = getMicrophoneController();
    if (!controller) return;
    try {
      if (!controller.isActive() && controller.isConnecting()) {
        this.scheduleRetry(enabled);
        return;
      }
      this.clearRetry();
      await controller.setMicrophoneEnabled(enabled, this.source);
    } catch (error) {
      logger.error({ message: 'Failed to set microphone from PTT input', context: { source: this.source, enabled, error } });
    }
  }

  private scheduleRetry(enabled: boolean): void {
    this.retryEnabled = enabled;
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      const next = this.retryEnabled;
      this.retryEnabled = null;
      if (next !== null) this.request(next);
    }, MIC_APPLY_RETRY_MS);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryEnabled = null;
  }

  private armReleaseFallback(): void {
    this.clearReleaseFallback();
    this.releaseFallback = setTimeout(() => {
      this.releaseFallback = null;
      if (this.pressed) this.release();
    }, MEDIA_PTT_RELEASE_FALLBACK_MS);
  }

  private clearReleaseFallback(): void {
    if (this.releaseFallback) clearTimeout(this.releaseFallback);
    this.releaseFallback = null;
  }
}
