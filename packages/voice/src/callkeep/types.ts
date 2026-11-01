/**
 * CallKeep keeps a LiveKit PTT session alive in the background (CallKit on iOS, self-managed ConnectionService on
 * Android) and reports system/headset mute actions back. R/U/I only (`capabilities.voice.callKeep`); every other variant
 * and web get `noopCallKeepService`.
 */
export interface CallKeepSetupConfig {
  appName: string;
  maximumCallGroups?: number;
  maximumCallsPerCallGroup?: number;
  includesCallsInRecents?: boolean;
  supportsVideo?: boolean;
  ringtoneSound?: string;
  /** Android phone-account prompt and call notification text, already translated by the caller. */
  android: {
    alertTitle: string;
    alertDescription: string;
    cancelButton: string;
    okButton: string;
    foregroundService: { channelId: string; channelName: string; notificationTitle: string; notificationIcon?: string };
  };
}

export interface CallKeepService {
  readonly isEnabled: boolean;
  setup(config: CallKeepSetupConfig): Promise<void>;
  /** Android READ_PHONE_STATE / READ_PHONE_NUMBERS, requested once per process right before a call starts. */
  requestPhonePermissions(): Promise<boolean>;
  startCall(roomName: string, handle?: string): Promise<string>;
  endCall(): Promise<void>;
  /** Reverse sync: tell the system call our mute state (app → CallKit). */
  setMuted(muted: boolean): Promise<void>;
  /** Forward sync: system/headset mute actions (CallKit → app). */
  setMuteStateCallback(callback: ((muted: boolean) => void) | null): void;
  setEndCallCallback(callback: (() => void) | null): void;
  /** Ignore system mute actions for a while (a BLE PTT press makes HFP fire spurious ones). */
  ignoreMuteEvents(durationMs: number): void;
  /** Stop forwarding mute actions while a specialized PTT handset is connected (prevents oscillation). */
  removeMuteListener(): void;
  restoreMuteListener(): void;
  isCallActiveNow(): boolean;
  getCurrentCallUUID(): string | null;
  cleanup(): Promise<void>;
}

const resolved = (): Promise<void> => Promise.resolve();

/** Variants without CallKeep, web and Electron. Tracks nothing and never touches react-native-callkeep. */
export const noopCallKeepService: CallKeepService = {
  isEnabled: false,
  setup: resolved,
  requestPhonePermissions: () => Promise.resolve(true),
  startCall: () => Promise.resolve(''),
  endCall: resolved,
  setMuted: resolved,
  setMuteStateCallback: () => undefined,
  setEndCallCallback: () => undefined,
  ignoreMuteEvents: () => undefined,
  removeMuteListener: () => undefined,
  restoreMuteListener: () => undefined,
  isCallActiveNow: () => false,
  getCurrentCallUUID: () => null,
  cleanup: resolved,
};
