import { logger } from '@resgrid/core';
import { DeviceEventEmitter, type EmitterSubscription, NativeEventEmitter, type NativeModule, NativeModules, Platform } from 'react-native';

import { useBluetoothAudioStore } from '../bluetooth/bluetooth-audio-store';
import { getCallKeepService } from '../callkeep/callkeep-service';
import { getMicrophoneController } from '../ptt/microphone-controller';
import { PttPressController } from '../ptt/ptt-press-controller';
import { type HeadsetButtonService, type HeadsetButtonType, type HeadsetMonitorOwner, isPttCapableButton, mapKeyCode, type MediaButtonKeyEvent } from './types';

interface MediaButtonModuleLike extends NativeModule {
  startListening?: () => void;
  stopListening?: () => void;
}

const IOS_EVENTS: readonly [string, HeadsetButtonType][] = [
  ['onMediaButtonToggle', 'play_pause'],
  ['onMediaButtonPlayPause', 'play_pause'],
  ['onMediaButtonPlay', 'play'],
  ['onMediaButtonPause', 'pause'],
];

const mediaButtonModule = (): MediaButtonModuleLike | null => (NativeModules as { MediaButtonModule?: MediaButtonModuleLike }).MediaButtonModule ?? null;

/**
 * Headset-button PTT (Responder headset-button.service + Unit media-button fallback), driven by the MediaButtonModule
 * config plugin: Android MediaSession key events (`onMediaButtonEvent`), iOS MPRemoteCommandCenter commands.
 *
 * iOS with CallKeep: AirPods presses arrive as CallKit mute actions (synced by the LiveKit store), and remote commands
 * would fight CallKit, so the module is only started on iOS when CallKeep is off.
 *
 * Settings (`mediaButtonPTTSettings` in the Bluetooth store): toggle mode counts clicks (single = toggle / play / pause,
 * double = `doubleTapAction`); push_to_talk mode transmits on key down and releases on key up or after a fallback.
 */
export class NativeHeadsetButtonService implements HeadsetButtonService {
  readonly isSupported = true;
  private owners = new Set<HeadsetMonitorOwner>();
  private subscriptions: EmitterSubscription[] = [];
  private nativeListening = false;
  private pressCount = 0;
  private lastPressAt = 0;
  private lastPressType: HeadsetButtonType = 'unknown';
  private clickTimer: ReturnType<typeof setTimeout> | null = null;
  readonly press = new PttPressController('headset');

  startMonitoring(owner: HeadsetMonitorOwner = 'livekit'): void {
    const wasActive = this.owners.size > 0;
    this.owners.add(owner);
    if (wasActive) return;
    this.subscribe();
    logger.info({ message: 'Headset button monitoring started', context: { owner } });
  }

  stopMonitoring(owner: HeadsetMonitorOwner = 'livekit'): void {
    if (!this.owners.delete(owner) || this.owners.size > 0) return;
    this.unsubscribe();
    this.clearClickTimer();
    this.press.reset();
    logger.info({ message: 'Headset button monitoring stopped' });
  }

  isMonitoringActive(): boolean {
    return this.owners.size > 0;
  }

  handleKeyEvent(event: MediaButtonKeyEvent): void {
    const action = (event?.action ?? '').toUpperCase();
    this.handleButton(mapKeyCode(event?.keyCode), action === 'ACTION_UP' ? 'up' : 'down');
  }

  handleButton(type: HeadsetButtonType, phase: 'down' | 'up' = 'down'): void {
    if (!this.isMonitoringActive()) return;
    const settings = useBluetoothAudioStore.getState().mediaButtonPTTSettings;
    if (!settings.enabled || !settings.usePlayPauseForPTT || !isPttCapableButton(type)) return;

    if (phase === 'down') {
      useBluetoothAudioStore.getState().setLastButtonEvent({ type: 'press', button: settings.pttMode === 'push_to_talk' ? 'ptt_start' : 'mute', timestamp: Date.now() });
    }

    if (settings.pttMode === 'push_to_talk') {
      if (Platform.OS === 'ios') {
        // Remote commands have no key-up: each command flips the press.
        if (phase === 'down') {
          if (this.press.isPressed()) this.press.release();
          else this.press.press('media');
        }
        return;
      }
      if (phase === 'down') this.press.press('media');
      else this.press.release();
      return;
    }

    if (phase === 'up') return;
    this.countClick(type, settings.doubleTapTimeoutMs, settings.doubleTapAction);
  }

  destroy(): void {
    this.owners.clear();
    this.unsubscribe();
    this.clearClickTimer();
    this.press.reset();
  }

  private countClick(type: HeadsetButtonType, thresholdMs: number, doubleTapAction: 'none' | 'toggle_mute'): void {
    const now = Date.now();
    this.pressCount = now - this.lastPressAt < thresholdMs ? this.pressCount + 1 : 1;
    this.lastPressAt = now;
    this.lastPressType = type;
    if (this.clickTimer) clearTimeout(this.clickTimer);
    this.clickTimer = setTimeout(() => {
      this.clickTimer = null;
      const count = this.pressCount;
      const pressed = this.lastPressType;
      this.pressCount = 0;
      void this.executeClick(pressed, count, doubleTapAction);
    }, thresholdMs);
  }

  private async executeClick(type: HeadsetButtonType, count: number, doubleTapAction: 'none' | 'toggle_mute'): Promise<void> {
    const controller = getMicrophoneController();
    if (!controller?.isActive()) {
      logger.debug({ message: 'Headset button ignored: no active voice channel', context: { type, count } });
      return;
    }
    try {
      if (count === 1) {
        if (type === 'play') await controller.setMicrophoneEnabled(true, 'headset');
        else if (type === 'pause') await controller.setMicrophoneEnabled(false, 'headset');
        else await controller.toggleMicrophone('headset');
      } else if (count >= 2 && doubleTapAction === 'toggle_mute') {
        await controller.toggleMicrophone('headset');
      }
    } catch (error) {
      logger.error({ message: 'Headset button action failed', context: { type, count, error } });
    }
  }

  private subscribe(): void {
    const module = mediaButtonModule();
    if (Platform.OS === 'android') {
      this.subscriptions.push(DeviceEventEmitter.addListener('onMediaButtonEvent', (event: MediaButtonKeyEvent) => this.handleKeyEvent(event)));
      this.startNative(module);
      return;
    }
    if (Platform.OS === 'ios' && module && !getCallKeepService().isEnabled) {
      const emitter = new NativeEventEmitter(module);
      for (const [name, type] of IOS_EVENTS) {
        this.subscriptions.push(emitter.addListener(name, () => this.handleButton(type, 'down')));
      }
      this.startNative(module);
    }
  }

  private startNative(module: MediaButtonModuleLike | null): void {
    if (!module?.startListening) return;
    try {
      module.startListening();
      this.nativeListening = true;
    } catch (error) {
      logger.warn({ message: 'MediaButtonModule.startListening failed', context: { error } });
    }
  }

  private unsubscribe(): void {
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    if (!this.nativeListening) return;
    this.nativeListening = false;
    try {
      mediaButtonModule()?.stopListening?.();
    } catch (error) {
      logger.warn({ message: 'MediaButtonModule.stopListening failed', context: { error } });
    }
  }

  private clearClickTimer(): void {
    if (this.clickTimer) clearTimeout(this.clickTimer);
    this.clickTimer = null;
    this.pressCount = 0;
  }
}

let instance: NativeHeadsetButtonService | null = null;

export function getHeadsetButtonService(): HeadsetButtonService {
  if (!instance) instance = new NativeHeadsetButtonService();
  return instance;
}

/** Test helper. Not for app code. */
export function resetHeadsetButtonServiceForTests(): void {
  instance?.destroy();
  instance = null;
}
