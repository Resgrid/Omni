// Unit livekit-store routing (applyAudioRouting) and Responder's recording-session release, plus the web no-ops.
import { setAudioModeAsync } from '../../__tests__/fakes/expo-audio';
import { AudioSession, registerGlobals } from '../../__tests__/fakes/livekit-react-native';
import { NativeModules, Platform, resetReactNativeFake } from '../../__tests__/fakes/react-native';
import { resolveAudioRouteTarget } from '../audio-route';
import { applyAudioRouting, registerLiveKitGlobals, releaseRecordingSession, startAudioSession, stopAudioSession } from '../audio-session';
import * as web from '../audio-session.web';

beforeEach(() => resetReactNativeFake());

describe('Android routing', () => {
  it('selects the route through InCallAudioModule, then sets a call-compatible audio mode', async () => {
    const setAudioRoute = jest.fn(async () => undefined);
    NativeModules.InCallAudioModule = { setAudioRoute };
    await applyAudioRouting('bluetooth');
    expect(setAudioRoute).toHaveBeenCalledWith('bluetooth');
    expect(setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: true, shouldPlayInBackground: true, playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldRouteThroughEarpiece: true });

    await applyAudioRouting('speaker');
    expect(setAudioRoute).toHaveBeenLastCalledWith('speaker');
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ shouldRouteThroughEarpiece: false }));

    await applyAudioRouting('default');
    expect(setAudioRoute).toHaveBeenLastCalledWith('earpiece');
  });

  it('falls back to the audio mode when InCallAudioModule fails or is missing', async () => {
    NativeModules.InCallAudioModule = { setAudioRoute: jest.fn(async () => Promise.reject(new Error('no device'))) };
    await applyAudioRouting('bluetooth');
    expect(setAudioModeAsync).toHaveBeenCalled();
    delete NativeModules.InCallAudioModule;
    setAudioModeAsync.mockClear();
    await applyAudioRouting('speaker');
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
  });
});

describe('iOS routing', () => {
  it('drops defaultToSpeaker only for the earpiece target', async () => {
    Platform.OS = 'ios';
    const setAudioRoute = jest.fn();
    NativeModules.InCallAudioModule = { setAudioRoute };
    await applyAudioRouting('earpiece');
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ shouldRouteThroughEarpiece: true }));
    await applyAudioRouting('bluetooth');
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ shouldRouteThroughEarpiece: false }));
    expect(setAudioRoute).not.toHaveBeenCalled();
  });
});

describe('sessions', () => {
  it('starts/stops the LiveKit audio session, registers globals and releases the recording session', async () => {
    await startAudioSession();
    await stopAudioSession();
    registerLiveKitGlobals();
    await releaseRecordingSession();
    expect(AudioSession.startAudioSession).toHaveBeenCalled();
    expect(AudioSession.stopAudioSession).toHaveBeenCalled();
    expect(registerGlobals).toHaveBeenCalled();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: false }));
  });

  it('is a no-op on web', async () => {
    await web.startAudioSession();
    await web.applyAudioRouting('speaker');
    await web.releaseRecordingSession();
    web.registerLiveKitGlobals();
    expect(AudioSession.startAudioSession).not.toHaveBeenCalled();
    expect(setAudioModeAsync).not.toHaveBeenCalled();
  });
});

describe('resolveAudioRouteTarget', () => {
  it('prefers a connected Bluetooth audio device, then the speaker selection, then the earpiece', () => {
    expect(resolveAudioRouteTarget({ connectedDevice: { hasAudioCapability: true }, speaker: { type: 'speaker' } })).toBe('bluetooth');
    expect(resolveAudioRouteTarget({ connectedDevice: null, speaker: { type: 'speaker' } })).toBe('speaker');
    expect(resolveAudioRouteTarget({ connectedDevice: null, speaker: { type: 'bluetooth' } })).toBe('bluetooth');
    expect(resolveAudioRouteTarget({ connectedDevice: { hasAudioCapability: false }, speaker: null })).toBe('earpiece');
  });
});
