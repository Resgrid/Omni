// Stand-ins for the packages whose native modules have no Jest implementation (voice: BLE/LiveKit; notifications: notifee),
// plus a realtime store and location transmitter the location section can drive.
import type { ExactAlarmAccessView } from '@resgrid/notifications';
import { create } from 'zustand';

export const mockVoiceStore = create(() => ({
  availableDevices: [] as { id: string; name: string | null; isConnected: boolean }[],
  isScanning: false,
  bluetoothState: 'poweredOn',
  preferredDevice: null as { id: string; name: string } | null,
  connectedDevice: null as { id: string } | null,
  availableAudioDevices: [
    { id: 'default-mic', name: 'Default Microphone', type: 'microphone', isAvailable: true },
    { id: 'default-speaker', name: 'Default Speaker', type: 'speaker', isAvailable: true },
  ],
  selectedAudioDevices: { microphone: null as unknown, speaker: null as unknown },
  setSelectedMicrophone: jest.fn(),
  setSelectedSpeaker: jest.fn(),
}));

export const mockBluetoothService = {
  startScanning: jest.fn(async () => undefined),
  connectToDevice: jest.fn(async () => undefined),
  connectToSystemAudio: jest.fn(async () => undefined),
  setPreferredDevice: jest.fn(),
};

export const voiceModule = () => ({
  useBluetoothAudioStore: mockVoiceStore,
  getBluetoothAudioService: () => mockBluetoothService,
  SYSTEM_AUDIO_DEVICE: { id: 'system-audio', name: 'System Audio' },
  BluetoothState: { Unknown: 'unknown', PoweredOff: 'poweredOff', PoweredOn: 'poweredOn', Unauthorized: 'unauthorized' },
});

export const mockSoundService = { play: jest.fn(async () => undefined) };

/** Exact-alarm access the notifications section reads (Android); tests set `access`. */
export const mockExactAlarms: ExactAlarmAccessView = { access: 'notNeeded', request: jest.fn(async () => undefined) };

export const notificationsModule = () => ({
  notificationSoundService: mockSoundService,
  // The real gate: the active manifest has the unit status console.
  hasStatusTimerNotifications: () => jest.requireActual<{ getActiveVariant: () => { modules: readonly string[] } }>('@resgrid/config').getActiveVariant().modules.includes('unit-status'),
  useExactAlarmAccess: (enabled: boolean) => (enabled ? mockExactAlarms : { access: 'notNeeded', request: mockExactAlarms.request }),
});

export const mockRealtimeStore = create(() => ({
  hubs: { eventing: { status: 'connected', joined: true, joinedAt: 1 }, geolocation: { status: 'disconnected', joined: false, joinedAt: 0 }, chat: { status: 'disconnected', joined: false, joinedAt: 0 } },
  connectGeolocationHub: jest.fn(async () => undefined),
  disconnectGeolocationHub: jest.fn(async () => undefined),
}));

export const realtimeModule = () => ({ useRealtimeStore: mockRealtimeStore });

export const mockTransmitter = { requestBackgroundTracking: jest.fn() };

export const locationModule = () => ({ getLocationTransmitter: () => mockTransmitter });
