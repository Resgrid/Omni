import { logger } from '@resgrid/core';
import { PermissionsAndroid, Platform } from 'react-native';
import RNCallKeep, { AudioSessionCategoryOption, AudioSessionMode } from 'react-native-callkeep';

import { generateUuid } from '../util/async';
import { CallKeepMuteFilter } from './mute-filter';
import type { CallKeepService, CallKeepSetupConfig } from './types';

/** iOS needs CallKit to have registered the outgoing call before mute is synced (Responder: 800 ms). */
export const IOS_CONNECTED_REPORT_DELAY_MS = 800;
const PHONE_PERMISSION_TIMEOUT_MS = 5000;

interface RtcAudioSessionLike {
  audioSessionDidActivate?: () => void;
  audioSessionDidDeactivate?: () => void;
}

/** WebRTC must be told when CallKit activates the audio session, or the call has no audio on iOS. Lazy: Android/tests never load it. */
const rtcAudioSession = (): RtcAudioSessionLike | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webrtc = require('@livekit/react-native-webrtc') as { RTCAudioSession?: RtcAudioSessionLike };
    return webrtc.RTCAudioSession ?? null;
  } catch {
    return null;
  }
};

const hasTelephony = async (): Promise<boolean> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const device = require('expo-device') as { hasPlatformFeatureAsync?: (feature: string) => Promise<boolean> };
    return device.hasPlatformFeatureAsync ? await device.hasPlatformFeatureAsync('android.hardware.telephony') : true;
  } catch {
    return true;
  }
};

/**
 * CallKeep for R/U/I (omni-plan §7.8). iOS: Responder's CallKit service (connected report after the call registers,
 * reverse mute sync, mute storm protection, WebRTC audio-session hand-off). Android: Responder's self-managed
 * ConnectionService plus Unit's phone-permission flow (both permissions, telephony check, once per process, 5 s cap).
 */
export class NativeCallKeepService implements CallKeepService {
  readonly isEnabled = true;
  private isSetup = false;
  private isCallActive = false;
  private currentCallUUID: string | null = null;
  private muteStateCallback: ((muted: boolean) => void) | null = null;
  private endCallCallback: (() => void) | null = null;
  private phonePermissionsAttempted = false;
  private readonly muteFilter: CallKeepMuteFilter;

  constructor(now: () => number = Date.now) {
    this.muteFilter = new CallKeepMuteFilter(now);
  }

  async setup(config: CallKeepSetupConfig): Promise<void> {
    if (this.isSetup) return;
    const isAndroid = Platform.OS === 'android';
    const androidVersion = Number(Platform.Version);
    await RNCallKeep.setup({
      ios: {
        appName: config.appName,
        maximumCallGroups: String(config.maximumCallGroups ?? 1),
        maximumCallsPerCallGroup: String(config.maximumCallsPerCallGroup ?? 1),
        includesCallsInRecents: config.includesCallsInRecents ?? false,
        supportsVideo: config.supportsVideo ?? false,
        ...(config.ringtoneSound ? { ringtoneSound: config.ringtoneSound } : {}),
        audioSession: {
          categoryOptions: AudioSessionCategoryOption.allowAirPlay + AudioSessionCategoryOption.allowBluetooth + AudioSessionCategoryOption.allowBluetoothA2DP + AudioSessionCategoryOption.defaultToSpeaker,
          mode: AudioSessionMode.voiceChat,
        },
      },
      android: {
        alertTitle: config.android.alertTitle,
        alertDescription: config.android.alertDescription,
        cancelButton: config.android.cancelButton,
        okButton: config.android.okButton,
        additionalPermissions: isAndroid ? [PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE, ...(androidVersion >= 30 ? [PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS] : [])] : [],
        selfManaged: true,
        foregroundService: config.android.foregroundService,
      },
    });
    if (isAndroid && androidVersion >= 23) {
      RNCallKeep.setAvailable(true);
    }
    this.setupEventListeners();
    this.isSetup = true;
    logger.info({ message: 'CallKeep setup completed', context: { platform: Platform.OS } });
  }

  async requestPhonePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const check = async (): Promise<boolean> => {
      const [state, numbers] = await Promise.all([PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE), PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS)]);
      return state && numbers;
    };
    try {
      if (await check()) return true;
      if (this.phonePermissionsAttempted) return false;
      this.phonePermissionsAttempted = true;
      const work = async (): Promise<boolean> => {
        if (!(await hasTelephony())) {
          logger.info({ message: 'Device has no telephony; CallKeep phone permissions skipped' });
          return false;
        }
        await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE, PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS]);
        return check();
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), PHONE_PERMISSION_TIMEOUT_MS);
      });
      const granted = await Promise.race([work(), timeout]).finally(() => {
        if (timer) clearTimeout(timer);
      });
      if (!granted) logger.warn({ message: 'Phone permissions not granted; CallKeep skipped (voice still works)' });
      return granted;
    } catch (error) {
      logger.warn({ message: 'Phone permission request failed; CallKeep skipped', context: { error } });
      return false;
    }
  }

  async startCall(roomName: string, handle?: string): Promise<string> {
    if (!this.isSetup) {
      logger.warn({ message: 'CallKeep startCall before setup' });
      if (Platform.OS === 'ios') throw new Error('CallKeep not setup. Call setup() first.');
    }
    if (this.currentCallUUID) await this.endCall();

    const uuid = generateUuid();
    this.currentCallUUID = uuid;
    const callHandle = handle || roomName || 'Voice Channel';
    try {
      RNCallKeep.startCall(uuid, callHandle, roomName, 'generic', false);
      if (Platform.OS === 'android') {
        RNCallKeep.setCurrentCallActive(uuid);
        this.isCallActive = true;
        return uuid;
      }
      RNCallKeep.reportConnectingOutgoingCallWithUUID(uuid);
      return await new Promise<string>((resolve) => {
        setTimeout(() => {
          if (this.currentCallUUID !== uuid) {
            resolve('');
            return;
          }
          RNCallKeep.reportConnectedOutgoingCallWithUUID(uuid);
          this.isCallActive = true;
          resolve(uuid);
        }, IOS_CONNECTED_REPORT_DELAY_MS);
      });
    } catch (error) {
      this.currentCallUUID = null;
      this.isCallActive = false;
      throw error;
    }
  }

  async endCall(): Promise<void> {
    const uuid = this.currentCallUUID;
    if (!uuid) return;
    this.currentCallUUID = null;
    this.isCallActive = false;
    try {
      RNCallKeep.endCall(uuid);
    } catch (error) {
      logger.warn({ message: 'Failed to end CallKeep call', context: { error } });
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.currentCallUUID) return;
    try {
      RNCallKeep.setMutedCall(this.currentCallUUID, muted);
    } catch (error) {
      logger.warn({ message: 'Failed to update CallKeep mute state', context: { error, muted } });
    }
  }

  setMuteStateCallback(callback: ((muted: boolean) => void) | null): void {
    this.muteStateCallback = callback;
  }

  setEndCallCallback(callback: (() => void) | null): void {
    this.endCallCallback = callback;
  }

  ignoreMuteEvents(durationMs: number): void {
    this.muteFilter.ignoreFor(durationMs);
  }

  removeMuteListener(): void {
    this.muteFilter.setEnabled(false);
  }

  restoreMuteListener(): void {
    this.muteFilter.setEnabled(true);
  }

  isCallActiveNow(): boolean {
    return this.isCallActive && this.currentCallUUID !== null;
  }

  getCurrentCallUUID(): string | null {
    return this.currentCallUUID;
  }

  /** System/headset mute action (CallKit UI, AirPods, HFP). Filtered, then forwarded to the LiveKit store. */
  handleMutedCallAction = ({ muted, callUUID }: { muted: boolean; callUUID: string }): void => {
    const decision = this.muteFilter.evaluate();
    if (decision !== 'forward') {
      logger.debug({ message: 'Ignored CallKeep mute action', context: { muted, decision } });
      return;
    }
    if (this.currentCallUUID && callUUID && callUUID !== this.currentCallUUID) return;
    try {
      this.muteStateCallback?.(muted);
    } catch (error) {
      logger.warn({ message: 'CallKeep mute callback failed', context: { error } });
    }
  };

  handleEndCall = ({ callUUID }: { callUUID: string }): void => {
    if (callUUID !== this.currentCallUUID) return;
    this.currentCallUUID = null;
    this.isCallActive = false;
    try {
      this.endCallCallback?.();
    } catch (error) {
      logger.warn({ message: 'CallKeep end call callback failed', context: { error } });
    }
  };

  async cleanup(): Promise<void> {
    await this.endCall();
    for (const event of ['didActivateAudioSession', 'didDeactivateAudioSession', 'endCall', 'didPerformSetMutedCallAction'] as const) {
      try {
        RNCallKeep.removeEventListener(event);
      } catch {
        // Listener was never registered.
      }
    }
    this.muteFilter.reset();
    this.isSetup = false;
  }

  private setupEventListeners(): void {
    if (Platform.OS === 'ios') {
      RNCallKeep.addEventListener('didActivateAudioSession', () => rtcAudioSession()?.audioSessionDidActivate?.());
      RNCallKeep.addEventListener('didDeactivateAudioSession', () => rtcAudioSession()?.audioSessionDidDeactivate?.());
    }
    RNCallKeep.addEventListener('endCall', this.handleEndCall);
    RNCallKeep.addEventListener('didPerformSetMutedCallAction', this.handleMutedCallAction);
  }
}

export const createNativeCallKeepService = (): CallKeepService => new NativeCallKeepService();
