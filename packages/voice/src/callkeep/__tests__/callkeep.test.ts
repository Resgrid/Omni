// Ported from Responder services/__tests__/callkeep-mute-handling.test.ts and Unit callkeep.service.ios.test.ts.
import { RTCAudioSession } from '../../__tests__/fakes/livekit-react-native-webrtc';
import { NativeModules, PermissionsAndroid, Platform, resetReactNativeFake } from '../../__tests__/fakes/react-native';
import RNCallKeep, { emitCallKeepEvent, resetCallKeepFake } from '../../__tests__/fakes/react-native-callkeep';
import { activateVariant } from '../../__tests__/helpers/variant';
import { configureVoice, resetVoiceRuntimeForTests } from '../../runtime';
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

// The earbud call button arrives as "end call"; it may only toggle talk when no other phone call is on the device.
describe('isAnotherCallActive', () => {
  const setUp = async (): Promise<NativeCallKeepService> => {
    const service = new NativeCallKeepService();
    await service.setup({
      appName: 'Resgrid',
      android: { alertTitle: 't', alertDescription: 'd', cancelButton: 'c', okButton: 'o', foregroundService: { channelId: 'voice_call', channelName: 'Call', notificationTitle: 'n' } },
    });

    return service;
  };

  afterEach(() => {
    delete NativeModules.InCallAudioModule;
  });

  it('iOS: ignores our own call (not yet marked ended) and finished calls, and sees any other live call', async () => {
    Platform.OS = 'ios';
    const service = await setUp();
    const call = (callUUID: string, hasEnded: boolean) => ({ callUUID, hasEnded, hasConnected: true, onHold: false, outgoing: false });

    jest.mocked(RNCallKeep.getCalls).mockResolvedValueOnce([call('ABC-OURS', false), call('OLD', true)]);
    await expect(service.isAnotherCallActive('abc-ours')).resolves.toBe(false);

    jest.mocked(RNCallKeep.getCalls).mockResolvedValueOnce([call('ABC-OURS', false), call('CELLULAR', false)]);
    await expect(service.isAnotherCallActive('abc-ours')).resolves.toBe(true);
  });

  it('Android: asks whether the device is in a phone call, and assumes one when it cannot tell', async () => {
    Platform.OS = 'android';
    const service = await setUp();
    expect(await service.isAnotherCallActive()).toBe(true);

    const isInPhoneCall = jest.fn(async () => false);
    NativeModules.InCallAudioModule = { isInPhoneCall };
    expect(await service.isAnotherCallActive()).toBe(false);
    isInPhoneCall.mockResolvedValueOnce(true);
    expect(await service.isAnotherCallActive()).toBe(true);
    isInPhoneCall.mockRejectedValueOnce(new Error('no audio manager'));
    expect(await service.isAnotherCallActive()).toBe(true);
  });
});

describe('capability gating', () => {
  it.each(['responder', 'unit', 'ic', 'dispatch'] as const)('%s gets the native CallKeep service on iOS/Android', (variant) => {
    activateVariant(variant);
    Platform.OS = 'ios';
    expect(getCallKeepService()).toBeInstanceOf(NativeCallKeepService);
  });

  it('BigBoard gets the no-op service and never loads react-native-callkeep', async () => {
    activateVariant('bigboard');
    const service = getCallKeepService();
    expect(service).toBe(noopCallKeepService);
    await service.startCall('A');
    expect(RNCallKeep.startCall).not.toHaveBeenCalled();
  });

  // App Store guideline 5 (IC fix, now every app): no CallKit where the device region is China.
  it('is a no-op on iOS when CallKit is restricted in the device region, but not on Android', () => {
    activateVariant('dispatch');
    configureVoice({ getApiContext: () => null, restrictCallKit: true });
    Platform.OS = 'ios';
    expect(getCallKeepService()).toBe(noopCallKeepService);
    Platform.OS = 'android';
    expect(getCallKeepService()).toBeInstanceOf(NativeCallKeepService);
    resetVoiceRuntimeForTests();
  });

  it('is a no-op on web even for CallKeep variants', () => {
    activateVariant('unit');
    Platform.OS = 'web';
    expect(getCallKeepService()).toBe(noopCallKeepService);
  });
});
