// Ported from Responder services/__tests__/callkeep-mute-handling.test.ts and Unit callkeep.service.ios.test.ts.
import { RTCAudioSession } from '../../__tests__/fakes/livekit-react-native-webrtc';
import { PermissionsAndroid, Platform, resetReactNativeFake } from '../../__tests__/fakes/react-native';
import RNCallKeep, { emitCallKeepEvent, resetCallKeepFake } from '../../__tests__/fakes/react-native-callkeep';
import { activateVariant } from '../../__tests__/helpers/variant';
import { NativeCallKeepService } from '../callkeep-native';
import { getCallKeepService, resetCallKeepServiceForTests } from '../callkeep-service';
import { CallKeepMuteFilter } from '../mute-filter';
import { noopCallKeepService } from '../types';

const config = {
  appName: 'Resgrid Responder',
  android: { alertTitle: 'Permissions', alertDescription: 'Phone accounts', cancelButton: 'Cancel', okButton: 'OK', foregroundService: { channelId: 'call', channelName: 'Call', notificationTitle: 'Call in progress' } },
};

beforeEach(() => {
  resetReactNativeFake();
  resetCallKeepFake();
  resetCallKeepServiceForTests();
});

describe('CallKeep mute filter (CallKit → app)', () => {
  let now = 1_000_000;
  let service: NativeCallKeepService;
  let muteCallback: jest.Mock;
  const muteEvent = (muted: boolean) => service.handleMutedCallAction({ muted, callUUID: '' });

  beforeEach(() => {
    now = 1_000_000;
    service = new NativeCallKeepService(() => now);
    muteCallback = jest.fn();
    service.setMuteStateCallback(muteCallback);
  });

  it('forwards a mute change to the registered callback', () => {
    muteEvent(true);
    expect(muteCallback).toHaveBeenCalledWith(true);
  });

  it('ignores mute changes while a PTT press holds the external lock', () => {
    service.ignoreMuteEvents(1000);
    muteEvent(true);
    expect(muteCallback).not.toHaveBeenCalled();
    now += 1001;
    muteEvent(false);
    expect(muteCallback).toHaveBeenCalledWith(false);
  });

  it('drops a storm of rapid mute changes until it settles', () => {
    muteEvent(true);
    now += 100;
    muteEvent(false);
    now += 100;
    muteEvent(true);
    expect(muteCallback).toHaveBeenCalledTimes(1);
    now += 900;
    muteEvent(false);
    expect(muteCallback).toHaveBeenCalledTimes(2);
    expect(muteCallback).toHaveBeenLastCalledWith(false);
  });

  it('stops forwarding while a specialized PTT device has removed the listener', () => {
    service.removeMuteListener();
    muteEvent(true);
    expect(muteCallback).not.toHaveBeenCalled();
    service.restoreMuteListener();
    now += 600;
    muteEvent(false);
    expect(muteCallback).toHaveBeenCalledWith(false);
  });

  it('reports why an action was filtered', () => {
    const filter = new CallKeepMuteFilter(() => now);
    expect(filter.evaluate()).toBe('forward');
    now += 10;
    expect(filter.evaluate()).toBe('storm');
    now += 600;
    expect(filter.evaluate()).toBe('storm-cooldown');
    filter.setEnabled(false);
    expect(filter.evaluate()).toBe('gate-closed');
  });
});

describe('NativeCallKeepService', () => {
  it('sets up a self-managed ConnectionService on Android with phone permissions and translated text', async () => {
    Platform.OS = 'android';
    Platform.Version = 34;
    const service = new NativeCallKeepService();
    await service.setup(config);
    expect(RNCallKeep.setup).toHaveBeenCalledWith(
      expect.objectContaining({
        android: expect.objectContaining({ selfManaged: true, alertTitle: 'Permissions', additionalPermissions: [PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE, PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS] }),
      })
    );
    expect(RNCallKeep.setAvailable).toHaveBeenCalledWith(true);
  });

  it('starts an active Android call immediately and ends it', async () => {
    Platform.OS = 'android';
    const service = new NativeCallKeepService();
    await service.setup(config);
    const uuid = await service.startCall('Fireground');
    expect(uuid).toMatch(/[0-9a-f-]{36}/);
    expect(RNCallKeep.setCurrentCallActive).toHaveBeenCalledWith(uuid);
    expect(service.isCallActiveNow()).toBe(true);
    await service.setMuted(true);
    expect(RNCallKeep.setMutedCall).toHaveBeenCalledWith(uuid, true);
    await service.endCall();
    expect(RNCallKeep.endCall).toHaveBeenCalledWith(uuid);
    expect(service.isCallActiveNow()).toBe(false);
  });

  it('on iOS reports connected only after CallKit registers the call and hands the audio session to WebRTC', async () => {
    Platform.OS = 'ios';
    jest.useFakeTimers();
    try {
      const service = new NativeCallKeepService();
      await service.setup(config);
      const pending = service.startCall('Fireground');
      expect(RNCallKeep.reportConnectingOutgoingCallWithUUID).toHaveBeenCalled();
      expect(RNCallKeep.reportConnectedOutgoingCallWithUUID).not.toHaveBeenCalled();
      jest.advanceTimersByTime(800);
      const uuid = await pending;
      expect(RNCallKeep.reportConnectedOutgoingCallWithUUID).toHaveBeenCalledWith(uuid);

      emitCallKeepEvent('didActivateAudioSession');
      emitCallKeepEvent('didDeactivateAudioSession');
      expect(RTCAudioSession.audioSessionDidActivate).toHaveBeenCalled();
      expect(RTCAudioSession.audioSessionDidDeactivate).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses to start an iOS call before setup', async () => {
    Platform.OS = 'ios';
    await expect(new NativeCallKeepService().startCall('A')).rejects.toThrow('CallKeep not setup');
  });

  it('runs the end-call callback when the call is ended from the system UI', async () => {
    Platform.OS = 'android';
    const service = new NativeCallKeepService();
    await service.setup(config);
    const onEnd = jest.fn();
    service.setEndCallCallback(onEnd);
    const uuid = await service.startCall('A');
    emitCallKeepEvent('endCall', { callUUID: 'other' });
    expect(onEnd).not.toHaveBeenCalled();
    emitCallKeepEvent('endCall', { callUUID: uuid });
    expect(onEnd).toHaveBeenCalled();
    expect(service.getCurrentCallUUID()).toBeNull();
  });

  it('requests Android phone permissions once per process', async () => {
    Platform.OS = 'android';
    PermissionsAndroid.check.mockImplementation(async () => false);
    const service = new NativeCallKeepService();
    await expect(service.requestPhonePermissions()).resolves.toBe(false);
    expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledTimes(1);
    await service.requestPhonePermissions();
    expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledTimes(1);

    PermissionsAndroid.check.mockImplementation(async () => true);
    await expect(service.requestPhonePermissions()).resolves.toBe(true);
  });

  it('cleans up listeners and ends the active call', async () => {
    Platform.OS = 'android';
    const service = new NativeCallKeepService();
    await service.setup(config);
    await service.startCall('A');
    await service.cleanup();
    expect(RNCallKeep.endCall).toHaveBeenCalled();
    expect(RNCallKeep.removeEventListener).toHaveBeenCalledWith('didPerformSetMutedCallAction');
  });
});

describe('capability gating', () => {
  it.each(['responder', 'unit', 'ic'] as const)('%s gets the native CallKeep service on iOS/Android', (variant) => {
    activateVariant(variant);
    Platform.OS = 'ios';
    expect(getCallKeepService()).toBeInstanceOf(NativeCallKeepService);
  });

  it.each(['dispatch', 'bigboard'] as const)('%s gets the no-op service and never loads react-native-callkeep', async (variant) => {
    activateVariant(variant);
    const service = getCallKeepService();
    expect(service).toBe(noopCallKeepService);
    await service.startCall('A');
    expect(RNCallKeep.startCall).not.toHaveBeenCalled();
  });

  it('is a no-op on web even for CallKeep variants', () => {
    activateVariant('unit');
    Platform.OS = 'web';
    expect(getCallKeepService()).toBe(noopCallKeepService);
  });
});
