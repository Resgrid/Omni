// Capabilities per variant, permissions, sounds, web remote audio, startup and the offline wipe hooks.
import { resetActiveVariantForTests } from '@resgrid/config';

import { resetCallKeepServiceForTests } from '../callkeep/callkeep-service';
import { getVoiceCapabilities } from '../capabilities';
import { initializeVoice, registerVoiceResets } from '../initialize';
import { createNotifeeForegroundService } from '../livekit/foreground-service';
import { useLiveKitStore } from '../livekit/livekit-store';
import { ensureMicrophonePermission } from '../livekit/microphone-permission';
import { attachRemoteAudio } from '../livekit/remote-audio.web';
import { configureVoice, resetVoiceRuntimeForTests } from '../runtime';
import { getRecordingPermissionsAsync } from './fakes/expo-audio';
import { Room } from './fakes/livekit-client';
import { registerGlobals } from './fakes/livekit-react-native';
import notifee from './fakes/notifee';
import { NativeModules, PermissionsAndroid, Platform, resetReactNativeFake } from './fakes/react-native';
import RNCallKeep from './fakes/react-native-callkeep';
import { activateVariant } from './helpers/variant';

jest.mock('@resgrid/api', () => ({ getDepartmentVoiceSettings: jest.fn(), canConnectToVoiceSession: jest.fn(), getDepartmentAudioStreams: jest.fn() }));

const setNavigator = (value: unknown) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });

beforeEach(() => {
  resetReactNativeFake();
  resetCallKeepServiceForTests();
  resetVoiceRuntimeForTests();
  setNavigator(undefined);
});

describe('getVoiceCapabilities', () => {
  it('maps each variant on native', () => {
    activateVariant('unit');
    expect(getVoiceCapabilities()).toEqual({ ptt: true, callKeep: true, bluetoothPtt: true, headsetButtonPtt: true, desktopPtt: false, backgroundAudio: true });
    activateVariant('ic');
    expect(getVoiceCapabilities()).toMatchObject({ callKeep: true, headsetButtonPtt: false });
    activateVariant('dispatch');
    expect(getVoiceCapabilities()).toMatchObject({ ptt: true, callKeep: false, bluetoothPtt: true, desktopPtt: false });
    activateVariant('bigboard');
    expect(getVoiceCapabilities()).toEqual({ ptt: false, callKeep: false, bluetoothPtt: false, headsetButtonPtt: false, desktopPtt: false, backgroundAudio: false });
  });

  it('narrows by platform on web: no CallKeep or headset buttons, desktop PTT on, Bluetooth only with Web Bluetooth', () => {
    Platform.OS = 'web';
    activateVariant('dispatch');
    expect(getVoiceCapabilities()).toMatchObject({ callKeep: false, headsetButtonPtt: false, desktopPtt: true, bluetoothPtt: false });
    setNavigator({ bluetooth: {} });
    expect(getVoiceCapabilities().bluetoothPtt).toBe(true);
    activateVariant('unit');
    expect(getVoiceCapabilities()).toMatchObject({ callKeep: false, headsetButtonPtt: false, desktopPtt: false });
  });

  it('turns everything off before a variant is active', () => {
    resetActiveVariantForTests();
    expect(getVoiceCapabilities().ptt).toBe(false);
  });
});

describe('microphone permission', () => {
  it('Android requests RECORD_AUDIO only when missing', async () => {
    await expect(ensureMicrophonePermission()).resolves.toEqual({ granted: true, canAskAgain: true });
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
    PermissionsAndroid.check.mockImplementation(async () => false);
    PermissionsAndroid.request.mockImplementation(async () => 'denied');
    await expect(ensureMicrophonePermission()).resolves.toEqual({ granted: false, canAskAgain: true });
  });

  it('iOS only checks (WebRTC prompts on publish) and reports a permanent denial', async () => {
    Platform.OS = 'ios';
    getRecordingPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true });
    await expect(ensureMicrophonePermission()).resolves.toEqual({ granted: true, canAskAgain: true });
    getRecordingPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false });
    await expect(ensureMicrophonePermission()).resolves.toEqual({ granted: false, canAskAgain: false });
  });
});

describe('web remote audio', () => {
  it('attaches subscribed audio tracks to the document and removes them on detach', () => {
    const appended: { id: string; remove: jest.Mock; pause: jest.Mock }[] = [];
    Object.defineProperty(globalThis, 'document', { value: { body: { appendChild: (el: (typeof appended)[number]) => appended.push(el) } }, configurable: true, writable: true });
    const room = new Room();
    const element = { id: '', remove: jest.fn(), pause: jest.fn() };
    const detach = attachRemoteAudio(room as never);
    room.emit('trackSubscribed', { kind: 'audio', sid: 'TR_1', attach: () => element, detach: () => [element] }, { trackSid: 'TR_1' });
    room.emit('trackSubscribed', { kind: 'video', sid: 'TR_2', attach: jest.fn(), detach: () => [] }, { trackSid: 'TR_2' });
    expect(appended).toEqual([element]);
    expect(element.id).toBe('livekit-audio-TR_1');
    detach();
    expect(element.remove).toHaveBeenCalled();
    expect(room.listenerCount('trackSubscribed')).toBe(0);
    Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true, writable: true });
  });
});

describe('foreground service', () => {
  it('shows a microphone-type foreground notification on Android and stops it', async () => {
    const fgs = createNotifeeForegroundService({ channelId: 'notif', title: 'PTT', body: 'Active' });
    await fgs.start();
    expect(notifee.displayNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'PTT', android: expect.objectContaining({ channelId: 'notif', asForegroundService: true, foregroundServiceTypes: [128] }) }));
    await fgs.stop();
    expect(notifee.stopForegroundService).toHaveBeenCalled();
    Platform.OS = 'ios';
    notifee.displayNotification.mockClear();
    await fgs.start();
    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });
});

describe('initializeVoice', () => {
  const callKeep = {
    appName: 'Resgrid Unit',
    android: { alertTitle: 't', alertDescription: 'd', cancelButton: 'c', okButton: 'o', foregroundService: { channelId: 'call', channelName: 'Call', notificationTitle: 'n' } },
  };

  it('registers LiveKit globals, preloads Android sounds and sets up CallKeep for CallKeep variants', async () => {
    activateVariant('unit');
    const loadSound = jest.fn();
    NativeModules.InCallAudioModule = { loadSound, playSound: jest.fn(), initializeAudio: jest.fn() };
    await initializeVoice({ callKeep, bluetooth: false });
    expect(registerGlobals).toHaveBeenCalled();
    expect(loadSound).toHaveBeenCalledWith('startTransmitting', 'space_notification1');
    expect(RNCallKeep.setup).toHaveBeenCalled();
  });

  it('does nothing for BigBoard', async () => {
    activateVariant('bigboard');
    RNCallKeep.setup.mockClear();
    await initializeVoice({ callKeep });
    expect(RNCallKeep.setup).not.toHaveBeenCalled();
  });
});

describe('registerVoiceResets', () => {
  it('registers teardowns, a store reset and the preserved preferred-device key', async () => {
    activateVariant('unit');
    configureVoice({ getApiContext: () => null });
    const teardowns = new Map<string, () => unknown>();
    const registry = {
      registerTeardown: jest.fn((name: string, fn: () => unknown) => {
        teardowns.set(name, fn);
        return () => teardowns.delete(name);
      }),
      registerStoreReset: jest.fn(() => () => undefined),
      registerPreservedKeys: jest.fn(),
    };
    const unregister = registerVoiceResets(registry as unknown as Parameters<typeof registerVoiceResets>[0]);
    expect(registry.registerPreservedKeys).toHaveBeenCalledWith(['preferredBluetoothDevice']);
    useLiveKitStore.setState({ availableRooms: [{ Id: '1', Name: 'A', ConferenceNumber: 0, IsDefault: true, Token: 't' }], isVoiceEnabled: true });
    await teardowns.get('voice-livekit')?.();
    expect(useLiveKitStore.getState()).toMatchObject({ availableRooms: [], isVoiceEnabled: false });
    unregister();
    expect(teardowns.size).toBe(0);
  });
});
