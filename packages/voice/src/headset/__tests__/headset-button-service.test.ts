// Ported from Responder services/__tests__/headset-button.service.test.ts and Unit's media-button fallback tests.
import { DeviceEventEmitter, getNativeModuleEmitter, NativeModules, Platform, resetReactNativeFake } from '../../__tests__/fakes/react-native';
import { createTestMicrophoneController, type TestMicrophoneController } from '../../__tests__/helpers/test-doubles';
import { activateVariant } from '../../__tests__/helpers/variant';
import { useBluetoothAudioStore } from '../../bluetooth/bluetooth-audio-store';
import { resetCallKeepServiceForTests } from '../../callkeep/callkeep-service';
import { registerMicrophoneController } from '../../ptt/microphone-controller';
import { getHeadsetButtonService, NativeHeadsetButtonService, resetHeadsetButtonServiceForTests } from '../headset-button-service';
import { KEYCODE_HEADSETHOOK, KEYCODE_MEDIA_NEXT, KEYCODE_MEDIA_PLAY_PAUSE, mapKeyCode } from '../types';

const mediaButtonModule = { startListening: jest.fn(), stopListening: jest.fn() };

const makeController = createTestMicrophoneController;

let controller: TestMicrophoneController;

beforeEach(() => {
  jest.useFakeTimers();
  resetReactNativeFake();
  resetCallKeepServiceForTests();
  resetHeadsetButtonServiceForTests();
  activateVariant('responder');
  NativeModules.MediaButtonModule = mediaButtonModule;
  useBluetoothAudioStore.getState().reset();
  controller = makeController();
  registerMicrophoneController(controller);
});

afterEach(() => {
  jest.useRealTimers();
  registerMicrophoneController(null);
});

const keyEvent = (keyCode: number, action: 'ACTION_DOWN' | 'ACTION_UP') => DeviceEventEmitter.emit('onMediaButtonEvent', { keyCode, action });

describe('Android media buttons (MediaButtonModule)', () => {
  it('starts and stops the native module with monitoring', () => {
    const service = getHeadsetButtonService();
    service.startMonitoring('livekit');
    expect(mediaButtonModule.startListening).toHaveBeenCalledTimes(1);
    expect(service.isMonitoringActive()).toBe(true);
    service.startMonitoring('livekit');
    expect(mediaButtonModule.startListening).toHaveBeenCalledTimes(1);
    service.stopMonitoring('livekit');
    expect(mediaButtonModule.stopListening).toHaveBeenCalledTimes(1);
    expect(service.isMonitoringActive()).toBe(false);
  });

  it('keeps listening while another owner (a BLE handset) still needs it', () => {
    const service = getHeadsetButtonService();
    service.startMonitoring('livekit');
    service.startMonitoring('bluetooth');
    service.stopMonitoring('livekit');
    expect(service.isMonitoringActive()).toBe(true);
    expect(mediaButtonModule.stopListening).not.toHaveBeenCalled();
    service.stopMonitoring('bluetooth');
    expect(mediaButtonModule.stopListening).toHaveBeenCalled();
  });

  it('toggles PTT on a single play/pause press (toggle mode)', async () => {
    getHeadsetButtonService().startMonitoring();
    keyEvent(KEYCODE_MEDIA_PLAY_PAUSE, 'ACTION_DOWN');
    keyEvent(KEYCODE_MEDIA_PLAY_PAUSE, 'ACTION_UP');
    expect(controller.toggleMicrophone).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(400);
    expect(controller.toggleMicrophone).toHaveBeenCalledWith('headset');
    expect(controller.enabled).toBe(true);
    expect(useBluetoothAudioStore.getState().lastButtonEvent).toMatchObject({ button: 'mute' });
  });

  it('treats a double tap as one toggle when doubleTapAction is toggle_mute', async () => {
    getHeadsetButtonService().startMonitoring();
    keyEvent(KEYCODE_HEADSETHOOK, 'ACTION_DOWN');
    jest.advanceTimersByTime(100);
    keyEvent(KEYCODE_HEADSETHOOK, 'ACTION_DOWN');
    await jest.advanceTimersByTimeAsync(400);
    expect(controller.toggleMicrophone).toHaveBeenCalledTimes(1);

    useBluetoothAudioStore.getState().setMediaButtonPTTSettings({ doubleTapAction: 'none' });
    keyEvent(KEYCODE_HEADSETHOOK, 'ACTION_DOWN');
    jest.advanceTimersByTime(100);
    keyEvent(KEYCODE_HEADSETHOOK, 'ACTION_DOWN');
    await jest.advanceTimersByTimeAsync(400);
    expect(controller.toggleMicrophone).toHaveBeenCalledTimes(1);
  });

  it('transmits while held and releases on key up (push_to_talk mode)', async () => {
    useBluetoothAudioStore.getState().setMediaButtonPTTSettings({ pttMode: 'push_to_talk' });
    getHeadsetButtonService().startMonitoring();
    keyEvent(KEYCODE_MEDIA_PLAY_PAUSE, 'ACTION_DOWN');
    await jest.advanceTimersByTimeAsync(0);
    expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(true, 'headset');
    keyEvent(KEYCODE_MEDIA_PLAY_PAUSE, 'ACTION_UP');
    await jest.advanceTimersByTimeAsync(0);
    expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, 'headset');
  });

  it('releases a held media-button press when key up never arrives', async () => {
    useBluetoothAudioStore.getState().setMediaButtonPTTSettings({ pttMode: 'push_to_talk' });
    getHeadsetButtonService().startMonitoring();
    keyEvent(KEYCODE_MEDIA_PLAY_PAUSE, 'ACTION_DOWN');
    await jest.advanceTimersByTimeAsync(1400);
    expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, 'headset');
  });

  it('ignores keys that cannot drive PTT, disabled settings and presses while not monitoring', async () => {
    const service = getHeadsetButtonService();
    keyEvent(KEYCODE_MEDIA_PLAY_PAUSE, 'ACTION_DOWN');
    service.startMonitoring();
    keyEvent(KEYCODE_MEDIA_NEXT, 'ACTION_DOWN');
    useBluetoothAudioStore.getState().setMediaButtonPTTEnabled(false);
    keyEvent(KEYCODE_MEDIA_PLAY_PAUSE, 'ACTION_DOWN');
    await jest.advanceTimersByTimeAsync(1000);
    expect(controller.toggleMicrophone).not.toHaveBeenCalled();
  });

  it('does nothing when no voice channel is active', async () => {
    controller.isActive.mockReturnValue(false);
    getHeadsetButtonService().startMonitoring();
    keyEvent(KEYCODE_MEDIA_PLAY_PAUSE, 'ACTION_DOWN');
    await jest.advanceTimersByTimeAsync(400);
    expect(controller.toggleMicrophone).not.toHaveBeenCalled();
  });
});

describe('iOS remote commands', () => {
  it('uses CallKit (not remote commands) when CallKeep is enabled', () => {
    Platform.OS = 'ios';
    getHeadsetButtonService().startMonitoring();
    expect(mediaButtonModule.startListening).not.toHaveBeenCalled();
  });

  it('listens to MPRemoteCommandCenter events when CallKeep is off', async () => {
    Platform.OS = 'ios';
    activateVariant('dispatch');
    resetCallKeepServiceForTests();
    getHeadsetButtonService().startMonitoring();
    expect(mediaButtonModule.startListening).toHaveBeenCalled();
    getNativeModuleEmitter(mediaButtonModule).emit('onMediaButtonToggle', { timestamp: 1 });
    await jest.advanceTimersByTimeAsync(400);
    expect(controller.toggleMicrophone).toHaveBeenCalledWith('headset');
  });
});

describe('button mapping and platforms', () => {
  it('maps Android key codes', () => {
    expect(mapKeyCode(85)).toBe('play_pause');
    expect(mapKeyCode(79)).toBe('hook');
    expect(mapKeyCode(126)).toBe('play');
    expect(mapKeyCode(127)).toBe('pause');
    expect(mapKeyCode(999)).toBe('unknown');
  });

  it('play enables and pause disables the microphone', async () => {
    const service = new NativeHeadsetButtonService();
    service.startMonitoring();
    service.handleButton('play');
    await jest.advanceTimersByTimeAsync(400);
    expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(true, 'headset');
    service.handleButton('pause');
    await jest.advanceTimersByTimeAsync(400);
    expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, 'headset');
    service.destroy();
  });
});
