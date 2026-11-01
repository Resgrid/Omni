/** Bluetooth PTT types shared by the store, the native (BLE manager) and web (Web Bluetooth) services. */

/** Mirrors react-native-ble-plx's state names (legacy store contract). */
export enum BluetoothState {
  Unknown = 'unknown',
  Resetting = 'resetting',
  Unsupported = 'unsupported',
  Unauthorized = 'unauthorized',
  PoweredOff = 'poweredOff',
  PoweredOn = 'poweredOn',
}

/** The fields voice reads from a discovered peripheral (react-native-ble-manager `Peripheral`, or a Web Bluetooth device). */
export interface BlePeripheral {
  id: string;
  name?: string | null;
  rssi?: number;
  advertising?: {
    isConnectable?: boolean;
    localName?: string;
    serviceUUIDs?: string[];
    manufacturerData?: unknown;
    serviceData?: unknown;
  };
}

export type BluetoothDeviceType = 'specialized' | 'system';

export interface BluetoothAudioDevice {
  id: string;
  name: string | null;
  rssi?: number;
  isConnected: boolean;
  hasAudioCapability: boolean;
  supportsMicrophoneControl: boolean;
  device: BlePeripheral;
  type: BluetoothDeviceType;
}

export type AudioButton = 'ptt_start' | 'ptt_stop' | 'volume_up' | 'volume_down' | 'mute' | 'unknown';

export interface AudioButtonEvent {
  type: 'press' | 'long_press' | 'double_press';
  button: AudioButton;
  timestamp: number;
}

export interface AudioDeviceInfo {
  id: string;
  name: string;
  type: 'bluetooth' | 'wired' | 'speaker' | 'default' | 'microphone';
  isAvailable: boolean;
}

export interface AudioDeviceSelection {
  microphone: AudioDeviceInfo | null;
  speaker: AudioDeviceInfo | null;
}

export interface PreferredBluetoothDevice {
  id: string;
  name: string;
}

/** The "use the phone's own audio" choice in the device picker (legacy id, persisted). */
export const SYSTEM_AUDIO_DEVICE: PreferredBluetoothDevice = { id: 'system-audio', name: 'System Audio' };

/**
 * Media-button PTT (AirPods/earbuds/AVRCP) settings (Unit types/ptt):
 * - toggle: a press toggles transmit;
 * - push_to_talk: key down transmits, key up releases (with a release fallback, many buttons never send key up).
 */
export type PttMode = 'toggle' | 'push_to_talk';

export interface MediaButtonPttSettings {
  enabled: boolean;
  pttMode: PttMode;
  usePlayPauseForPTT: boolean;
  doubleTapAction: 'none' | 'toggle_mute';
  doubleTapTimeoutMs: number;
}

export const DEFAULT_MEDIA_BUTTON_PTT_SETTINGS: Readonly<MediaButtonPttSettings> = Object.freeze({
  enabled: true,
  pttMode: 'toggle',
  usePlayPauseForPTT: true,
  doubleTapAction: 'toggle_mute',
  doubleTapTimeoutMs: 400,
});

export const createDefaultMediaButtonPttSettings = (): MediaButtonPttSettings => ({ ...DEFAULT_MEDIA_BUTTON_PTT_SETTINGS });

/** What every Bluetooth PTT implementation offers (Dispatch base.service, trimmed to the public surface). */
export interface BluetoothAudioService {
  readonly platform: 'native' | 'web';
  isSupported(): boolean;
  initialize(): Promise<void>;
  requestPermissions(): Promise<boolean>;
  checkBluetoothState(): Promise<BluetoothState>;
  /** Native: timed scan. Web: opens the browser's device chooser (needs a user gesture). */
  startScanning(durationMs?: number): Promise<void>;
  stopScanning(): Promise<void>;
  connectToDevice(deviceId: string): Promise<void>;
  disconnectDevice(): Promise<void>;
  /** Use the phone's own audio: drop any specialized device and remember that choice. */
  connectToSystemAudio(): Promise<void>;
  forgetPreferredDevice(deviceId: string): Promise<void>;
  setPreferredDevice(device: PreferredBluetoothDevice | null): void;
  isDeviceConnected(deviceId: string): Promise<boolean>;
  /** Re-arm button input after a LiveKit (re)connect: media-button fallback + watchdog (Unit). */
  ensurePttInputMonitoring(reason: string): void;
  /** Parse a hex payload as a given device family (debug screen). */
  testButtonMapping(deviceFamily: 'aina' | 'inrico' | 'hys' | 'generic', hex: string): AudioButtonEvent | null;
  destroy(): Promise<void>;
}
