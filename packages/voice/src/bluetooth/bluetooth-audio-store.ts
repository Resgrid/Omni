import { create } from 'zustand';

import {
  type AudioButtonEvent,
  type AudioDeviceInfo,
  type AudioDeviceSelection,
  type BluetoothAudioDevice,
  BluetoothState,
  createDefaultMediaButtonPttSettings,
  type MediaButtonPttSettings,
  type PreferredBluetoothDevice,
} from './types';

/**
 * Bluetooth audio state (Unit stores/app/bluetooth-audio-store): adapter state, discovered and connected devices, the
 * preferred device, call audio input/output selection, headset button monitoring and media-button PTT settings.
 * Platform-agnostic: the native and web services both write here.
 */
export interface BluetoothAudioState {
  bluetoothState: BluetoothState;
  isScanning: boolean;
  isConnecting: boolean;
  isHeadsetButtonMonitoring: boolean;
  availableDevices: BluetoothAudioDevice[];
  connectedDevice: BluetoothAudioDevice | null;
  preferredDevice: PreferredBluetoothDevice | null;
  availableAudioDevices: AudioDeviceInfo[];
  selectedAudioDevices: AudioDeviceSelection;
  connectionError: string | null;
  lastButtonEvent: AudioButtonEvent | null;
  mediaButtonPTTSettings: MediaButtonPttSettings;

  setBluetoothState: (state: BluetoothState) => void;
  setIsScanning: (isScanning: boolean) => void;
  setIsConnecting: (isConnecting: boolean) => void;
  setIsHeadsetButtonMonitoring: (isMonitoring: boolean) => void;
  addDevice: (device: BluetoothAudioDevice) => void;
  updateDevice: (deviceId: string, updates: Partial<BluetoothAudioDevice>) => void;
  removeDevice: (deviceId: string) => void;
  clearDevices: () => void;
  setConnectedDevice: (device: BluetoothAudioDevice | null) => void;
  setPreferredDevice: (device: PreferredBluetoothDevice | null) => void;
  setAvailableAudioDevices: (devices: AudioDeviceInfo[]) => void;
  setSelectedMicrophone: (device: AudioDeviceInfo | null) => void;
  setSelectedSpeaker: (device: AudioDeviceInfo | null) => void;
  updateAudioDeviceAvailability: (deviceId: string, isAvailable: boolean) => void;
  setConnectionError: (error: string | null) => void;
  clearConnectionError: () => void;
  setLastButtonEvent: (event: AudioButtonEvent | null) => void;
  setMediaButtonPTTSettings: (settings: Partial<MediaButtonPttSettings>) => void;
  setMediaButtonPTTEnabled: (enabled: boolean) => void;
  reset: () => void;
}

const DEFAULT_MICROPHONE: AudioDeviceInfo = { id: 'default-mic', name: 'Default Microphone', type: 'microphone', isAvailable: true };
const DEFAULT_SPEAKER: AudioDeviceInfo = { id: 'default-speaker', name: 'Default Speaker', type: 'speaker', isAvailable: true };

type BluetoothAudioData = Pick<
  BluetoothAudioState,
  | 'bluetoothState'
  | 'isScanning'
  | 'isConnecting'
  | 'isHeadsetButtonMonitoring'
  | 'availableDevices'
  | 'connectedDevice'
  | 'preferredDevice'
  | 'availableAudioDevices'
  | 'selectedAudioDevices'
  | 'connectionError'
  | 'lastButtonEvent'
  | 'mediaButtonPTTSettings'
>;

export const createInitialBluetoothAudioState = (): BluetoothAudioData => ({
  bluetoothState: BluetoothState.Unknown,
  isScanning: false,
  isConnecting: false,
  isHeadsetButtonMonitoring: false,
  availableDevices: [],
  connectedDevice: null,
  preferredDevice: null,
  availableAudioDevices: [DEFAULT_MICROPHONE, DEFAULT_SPEAKER],
  selectedAudioDevices: { microphone: DEFAULT_MICROPHONE, speaker: DEFAULT_SPEAKER },
  connectionError: null,
  lastButtonEvent: null,
  mediaButtonPTTSettings: createDefaultMediaButtonPttSettings(),
});

export const useBluetoothAudioStore = create<BluetoothAudioState>((set, get) => ({
  ...createInitialBluetoothAudioState(),

  setBluetoothState: (bluetoothState) => set({ bluetoothState }),
  setIsScanning: (isScanning) => set({ isScanning }),
  setIsConnecting: (isConnecting) => set({ isConnecting }),
  setIsHeadsetButtonMonitoring: (isHeadsetButtonMonitoring) => set({ isHeadsetButtonMonitoring }),

  addDevice: (device) => {
    const { availableDevices } = get();
    const index = availableDevices.findIndex((d) => d.id === device.id);
    if (index >= 0) {
      const next = [...availableDevices];
      next[index] = device;
      set({ availableDevices: next });
    } else {
      set({ availableDevices: [...availableDevices, device] });
    }
  },
  updateDevice: (deviceId, updates) => set({ availableDevices: get().availableDevices.map((d) => (d.id === deviceId ? { ...d, ...updates } : d)) }),
  removeDevice: (deviceId) => set({ availableDevices: get().availableDevices.filter((d) => d.id !== deviceId) }),
  clearDevices: () => set({ availableDevices: [] }),
  setConnectedDevice: (device) =>
    set({
      connectedDevice: device,
      availableDevices: get().availableDevices.map((d) => ({ ...d, isConnected: device !== null && d.id === device.id })),
    }),
  setPreferredDevice: (preferredDevice) => set({ preferredDevice }),

  setAvailableAudioDevices: (availableAudioDevices) => set({ availableAudioDevices }),
  setSelectedMicrophone: (microphone) => set({ selectedAudioDevices: { ...get().selectedAudioDevices, microphone } }),
  setSelectedSpeaker: (speaker) => set({ selectedAudioDevices: { ...get().selectedAudioDevices, speaker } }),
  updateAudioDeviceAvailability: (deviceId, isAvailable) => set({ availableAudioDevices: get().availableAudioDevices.map((d) => (d.id === deviceId ? { ...d, isAvailable } : d)) }),

  setConnectionError: (connectionError) => set({ connectionError }),
  clearConnectionError: () => set({ connectionError: null }),
  setLastButtonEvent: (lastButtonEvent) => set({ lastButtonEvent }),

  setMediaButtonPTTSettings: (settings) => set({ mediaButtonPTTSettings: { ...get().mediaButtonPTTSettings, ...settings } }),
  setMediaButtonPTTEnabled: (enabled) => set({ mediaButtonPTTSettings: { ...get().mediaButtonPTTSettings, enabled } }),

  reset: () => set(createInitialBluetoothAudioState()),
}));

/** The phone's built-in microphone/speaker among non-Bluetooth devices (Unit findDefaultAudioDevices). */
export const findDefaultAudioDevices = (devices: AudioDeviceInfo[]): { microphone: AudioDeviceInfo | undefined; speaker: AudioDeviceInfo | undefined } => {
  const local = devices.filter((d) => d.type !== 'bluetooth');
  return {
    microphone: local.find((d) => d.type === 'microphone' || d.id.toLowerCase().includes('mic')) ?? local.find((d) => d.type === 'default'),
    speaker: local.find((d) => d.type === 'speaker' || d.id.toLowerCase().includes('speaker')) ?? local.find((d) => d.type === 'default'),
  };
};
