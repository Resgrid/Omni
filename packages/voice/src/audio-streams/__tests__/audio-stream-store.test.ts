// Ported from Unit stores/app/__tests__/audio-stream-store.test.ts (+ Dispatch web store behaviour).
import { getDepartmentAudioStreams } from '@resgrid/api';

import { createAudioPlayer, FakeAudioPlayer, setAudioModeAsync } from '../../__tests__/fakes/expo-audio';
import { Platform, resetReactNativeFake } from '../../__tests__/fakes/react-native';
import { createTestConnectivity, type TestConnectivity } from '../../__tests__/helpers/connectivity';
import { activateVariant } from '../../__tests__/helpers/variant';
import { releaseRecordingSession } from '../../audio/audio-session';
import { getHeadsetButtonService } from '../../headset/headset-button-service';
import { useLiveKitStore } from '../../livekit/livekit-store';
import { configureVoice, resetVoiceRuntimeForTests } from '../../runtime';
import { base64Encode } from '../../util/bytes';
import { STREAM_LIVE_RESUME_RELOAD_MS, STREAM_MAX_RECONNECT_ATTEMPTS, STREAM_STALL_TIMEOUT_MS, useAudioStreamStore } from '../audio-stream-store';
import { redactStreamUrl, resolveStreamSource } from '../stream-source';

jest.mock('@resgrid/api', () => ({ getDepartmentAudioStreams: jest.fn(), getDepartmentVoiceSettings: jest.fn(), canConnectToVoiceSession: jest.fn() }));

const mockGetStreams = getDepartmentAudioStreams as jest.Mock;
const stream = (id: string, url = `https://audio.example.com/${id}.mp3`) => ({ Id: id, Name: `Scanner ${id}`, Type: 'mp3', Url: url });
const ctx = { http: {} } as never;
const lastPlayer = () => FakeAudioPlayer.instances[FakeAudioPlayer.instances.length - 1] as FakeAudioPlayer;

beforeEach(async () => {
  resetReactNativeFake();
  FakeAudioPlayer.instances = [];
  resetVoiceRuntimeForTests();
  configureVoice({ getApiContext: () => ctx });
  activateVariant('unit');
  await useAudioStreamStore.getState().reset();
  useLiveKitStore.setState({ isConnected: false });
});

describe('fetchAvailableStreams', () => {
  it('loads the department streams', async () => {
    mockGetStreams.mockResolvedValue({ Data: [stream('1'), stream('2')] });
    await useAudioStreamStore.getState().fetchAvailableStreams();
    expect(mockGetStreams).toHaveBeenCalledWith(ctx, { forceRefresh: undefined });
    expect(useAudioStreamStore.getState()).toMatchObject({ availableStreams: [{ Id: '1' }, { Id: '2' }], isLoadingStreams: false, error: null });
  });

  it('clears the list on error and reports fetch_failed', async () => {
    mockGetStreams.mockRejectedValue(new Error('offline'));
    await useAudioStreamStore.getState().fetchAvailableStreams();
    expect(useAudioStreamStore.getState()).toMatchObject({ availableStreams: [], error: { code: 'fetch_failed' } });
  });

  it('reports not_configured before an API context is injected', async () => {
    resetVoiceRuntimeForTests();
    await useAudioStreamStore.getState().fetchAvailableStreams();
    expect(useAudioStreamStore.getState().error).toEqual({ code: 'not_configured' });
  });
});

describe('play and stop', () => {
  it('plays a stream in the background with OS media controls when the variant declares background audio', async () => {
    await expect(useAudioStreamStore.getState().playStream(stream('1'))).resolves.toBe(true);
    const player = lastPlayer();
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ shouldPlayInBackground: true, allowsRecording: false }));
    expect(player.play).toHaveBeenCalled();
    expect(player.setActiveForLockScreen).toHaveBeenCalledWith(true, { title: 'Scanner 1' }, expect.objectContaining({ isLiveStream: true }));
    expect(useAudioStreamStore.getState()).toMatchObject({ currentStream: { Id: '1' }, isPlaying: true, isLoading: false });

    player.emitStatus({ playing: true, isBuffering: true });
    expect(useAudioStreamStore.getState()).toMatchObject({ isPlaying: true, isBuffering: true });
  });

  it('stays foreground-only (no media controls) where the variant has no background audio', async () => {
    activateVariant('bigboard');
    await useAudioStreamStore.getState().playStream(stream('1'));
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ shouldPlayInBackground: false }));
    expect(lastPlayer().setActiveForLockScreen).not.toHaveBeenCalled();
  });

  it('keeps the audio session record-capable while a PTT channel is joined', async () => {
    useLiveKitStore.setState({ isConnected: true });
    await useAudioStreamStore.getState().playStream(stream('1'));
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsRecording: true }));
  });

  it('moves inline credentials into an Authorization header for the player', async () => {
    await useAudioStreamStore.getState().playStream(stream('1', 'https://scanner:s3cret@audio.example.com/live'));
    expect(createAudioPlayer).toHaveBeenCalledWith({ uri: 'https://audio.example.com/live', headers: { Authorization: `Basic ${base64Encode('scanner:s3cret')}` } }, expect.anything());
  });

  it('stops the current stream before playing another and releases media controls', async () => {
    await useAudioStreamStore.getState().playStream(stream('1'));
    const first = lastPlayer();
    await useAudioStreamStore.getState().playStream(stream('2'));
    expect(first.pause).toHaveBeenCalled();
    expect(first.clearLockScreenControls).toHaveBeenCalled();
    expect(first.remove).toHaveBeenCalled();
    expect(useAudioStreamStore.getState().currentStream?.Id).toBe('2');
  });

  it('stops and resets state', async () => {
    await useAudioStreamStore.getState().playStream(stream('1'));
    const player = lastPlayer();
    await useAudioStreamStore.getState().stopStream();
    expect(player.pause).toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalled();
    expect(useAudioStreamStore.getState()).toMatchObject({ currentStream: null, isPlaying: false, isBuffering: false });
  });

  it('rejects a stream without a URL without disturbing the current one', async () => {
    await useAudioStreamStore.getState().playStream(stream('1'));
    await expect(useAudioStreamStore.getState().playStream(stream('2', '  '))).resolves.toBe(false);
    expect(useAudioStreamStore.getState()).toMatchObject({ currentStream: { Id: '1' }, error: { code: 'missing_url' } });
  });

  // iOS gives the lock-screen / Control Center controls only to a session that does not mix (IC fix); during a PTT call the
  // stream mixes like the call's own session.
  it('takes the audio on iOS so the lock-screen controls attach, and mixes while a PTT channel is joined', async () => {
    Platform.OS = 'ios';
    await useAudioStreamStore.getState().playStream(stream('1'));
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ interruptionMode: 'doNotMix', allowsRecording: false, shouldPlayInBackground: true }));

    useLiveKitStore.setState({ isConnected: true });
    await useAudioStreamStore.getState().playStream(stream('2'));
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ interruptionMode: 'mixWithOthers', allowsRecording: true }));
  });

  it('releases an older player whose setup resolves after a newer stream started', async () => {
    let releaseFirst: () => void = () => undefined;
    setAudioModeAsync.mockImplementationOnce(() => new Promise<undefined>((resolve) => (releaseFirst = () => resolve(undefined))));
    const first = useAudioStreamStore.getState().playStream(stream('1'));
    await useAudioStreamStore.getState().playStream(stream('2'));
    releaseFirst();
    await expect(first).resolves.toBe(false);
    const stale = FakeAudioPlayer.instances.find((p) => (p.source as { uri: string }).uri.endsWith('1.mp3'));
    expect(stale?.remove).toHaveBeenCalled();
    expect(useAudioStreamStore.getState()).toMatchObject({ currentStream: { Id: '2' }, isPlaying: true });
  });
});

describe('resolveStreamSource', () => {
  it('leaves a credential-free URL untouched', () => {
    expect(resolveStreamSource('https://audio.broadcastify.com/12345.mp3')).toEqual({ uri: 'https://audio.broadcastify.com/12345.mp3' });
  });

  it('hoists inline credentials into an Authorization header', () => {
    expect(resolveStreamSource('https://scanner:s3cret@audio.broadcastify.com/12345.mp3')).toEqual({
      uri: 'https://audio.broadcastify.com/12345.mp3',
      headers: { Authorization: `Basic ${base64Encode('scanner:s3cret')}` },
    });
  });

  it('percent-decodes credentials before encoding them', () => {
    expect(resolveStreamSource('http://user%40dept.org:p%40ss@relay.example.com/live')).toEqual({ uri: 'http://relay.example.com/live', headers: { Authorization: `Basic ${base64Encode('user@dept.org:p@ss')}` } });
  });

  it('treats a username without a password as an empty password', () => {
    expect(resolveStreamSource('https://token@relay.example.com/live')).toEqual({ uri: 'https://relay.example.com/live', headers: { Authorization: `Basic ${base64Encode('token:')}` } });
  });

  it('splits at the last @ so an unencoded @ in the password survives', () => {
    expect(resolveStreamSource('https://scanner:p@ss@relay.example.com/live')).toEqual({ uri: 'https://relay.example.com/live', headers: { Authorization: `Basic ${base64Encode('scanner:p@ss')}` } });
  });

  it('does not treat an @ in the path as credentials', () => {
    expect(resolveStreamSource('https://relay.example.com/live@2x.mp3')).toEqual({ uri: 'https://relay.example.com/live@2x.mp3' });
  });
});

describe('redactStreamUrl', () => {
  it('masks inline credentials (including an unencoded @) and leaves others alone', () => {
    expect(redactStreamUrl('https://audio.broadcastify.com/12345.mp3')).toBe('https://audio.broadcastify.com/12345.mp3');
    expect(redactStreamUrl('https://scanner:s3cret@audio.broadcastify.com/12345.mp3')).toBe('https://***@audio.broadcastify.com/12345.mp3');
    expect(redactStreamUrl('https://scanner:p@ss@relay.example.com/live')).toBe('https://***@relay.example.com/live');
    expect(redactStreamUrl('https://relay.example.com/live@2x.mp3')).toBe('https://relay.example.com/live@2x.mp3');
  });
});

describe('base64 (credential encoding)', () => {
  it('matches the standard encoding', () => {
    expect(base64Encode('scanner:s3cret')).toBe('c2Nhbm5lcjpzM2NyZXQ=');
    expect(base64Encode('user@dept.org:p@ss')).toBe('dXNlckBkZXB0Lm9yZzpwQHNz');
    expect(base64Encode('ü')).toBe('w7w=');
  });
});

describe('sharing the audio session with push-to-talk', () => {
  it('hands the stream its own mode (and lock-screen controls) back when a PTT call ends', async () => {
    Platform.OS = 'ios';
    useLiveKitStore.setState({ isConnected: true });
    await useAudioStreamStore.getState().playStream(stream('1'));
    await releaseRecordingSession();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ interruptionMode: 'doNotMix', allowsRecording: false }));

    await useAudioStreamStore.getState().stopStream();
    await releaseRecordingSession();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ interruptionMode: 'mixWithOthers', allowsRecording: false }));
  });

  it('takes the headset buttons back for push-to-talk when a stream starts', async () => {
    const reassert = jest.spyOn(getHeadsetButtonService(), 'reassertMediaSession');
    await useAudioStreamStore.getState().playStream(stream('1'));
    expect(reassert).toHaveBeenCalled();
  });
});

// The stream keeps playing until the member stops it: a drop (error, stall, the relay closing, a network change)
// reconnects in the same player, so the OS media controls and Android's media service stay up in the background.
describe('reconnect', () => {
  let connectivity: TestConnectivity;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    connectivity = createTestConnectivity(true);
    configureVoice({ getApiContext: () => ctx, connectivity });
  });

  afterEach(async () => {
    await useAudioStreamStore.getState().stopStream();
    jest.useRealTimers();
  });

  const playing = async () => {
    await useAudioStreamStore.getState().playStream(stream('1'));
    const player = lastPlayer();
    player.emitStatus({ playing: true });

    return player;
  };

  it('reconnects in the same player after an error, keeping the media controls up', async () => {
    const player = await playing();
    player.emitStatus({ error: 'Source error' });
    player.emitStatus({ error: 'Source error' });

    expect(useAudioStreamStore.getState()).toMatchObject({ currentStream: { Id: '1' }, isReconnecting: true, isPlaying: false, error: null });
    expect(player.remove).not.toHaveBeenCalled();
    expect(player.clearLockScreenControls).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_000);
    expect(player.replace).toHaveBeenCalledTimes(1);
    expect(player.replace).toHaveBeenCalledWith({ uri: 'https://audio.example.com/1.mp3' });
    expect(player.play).toHaveBeenCalledTimes(2);

    player.emitStatus({ playing: true });
    expect(useAudioStreamStore.getState()).toMatchObject({ isReconnecting: false, isPlaying: true });
    expect(FakeAudioPlayer.instances).toHaveLength(1);
  });

  it('treats a live stream that ends as a dropped connection', async () => {
    const player = await playing();
    player.emitStatus({ didJustFinish: true });
    expect(useAudioStreamStore.getState().isReconnecting).toBe(true);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(player.replace).toHaveBeenCalled();
  });

  it('reconnects a stream that stalls (buffering without playing)', async () => {
    const player = await playing();
    player.emitStatus({ isBuffering: true });
    await jest.advanceTimersByTimeAsync(STREAM_STALL_TIMEOUT_MS - 1);
    expect(useAudioStreamStore.getState().isReconnecting).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    expect(useAudioStreamStore.getState().isReconnecting).toBe(true);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(player.replace).toHaveBeenCalledTimes(1);
  });

  // The web player's 'waiting' event reports playing (not paused) and buffering together when the network goes.
  it('reconnects a stream that stalls while its player still reports playing, and counts it back only once audio runs', async () => {
    const player = await playing();
    player.emitStatus({ playing: true, isBuffering: true });
    expect(useAudioStreamStore.getState()).toMatchObject({ isPlaying: true, isBuffering: true, isReconnecting: false });

    await jest.advanceTimersByTimeAsync(STREAM_STALL_TIMEOUT_MS);
    expect(useAudioStreamStore.getState().isReconnecting).toBe(true);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(player.replace).toHaveBeenCalledTimes(1);

    player.emitStatus({ playing: true, isBuffering: true });
    expect(useAudioStreamStore.getState()).toMatchObject({ isReconnecting: true, isPlaying: false, isBuffering: true });

    player.emitStatus({ playing: true });
    expect(useAudioStreamStore.getState()).toMatchObject({ isReconnecting: false, isPlaying: true, isBuffering: false });
  });

  it('waits for the network while offline, then reconnects as soon as it is back', async () => {
    const player = await playing();
    connectivity.setOnline(false);
    player.emitStatus({ error: 'Network unreachable' });

    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(player.replace).not.toHaveBeenCalled();
    expect(useAudioStreamStore.getState()).toMatchObject({ isReconnecting: true, currentStream: { Id: '1' } });

    connectivity.setOnline(true);
    expect(player.replace).toHaveBeenCalledTimes(1);
  });

  it('reconnects at once when the device moves between Wi-Fi and cellular', async () => {
    const player = await playing();
    connectivity.changeNetwork();
    expect(player.replace).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last attempt and releases the player', async () => {
    const player = await playing();
    player.emitStatus({ error: 'Source error' });

    for (let attempt = 0; attempt < STREAM_MAX_RECONNECT_ATTEMPTS; attempt++) {
      await jest.advanceTimersByTimeAsync(30_000);
      player.emitStatus({ error: `Source error ${attempt}` });
    }

    expect(player.replace).toHaveBeenCalledTimes(STREAM_MAX_RECONNECT_ATTEMPTS);
    expect(player.remove).toHaveBeenCalled();
    expect(useAudioStreamStore.getState()).toMatchObject({ currentStream: null, isReconnecting: false, error: { code: 'playback_failed' } });
  });

  it('keeps a paused stream paused, and joins the live edge when it is resumed after a long pause', async () => {
    const player = await playing();
    // Paused from the lock screen / notification.
    player.emitStatus({ playing: false, isBuffering: false });
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(useAudioStreamStore.getState()).toMatchObject({ currentStream: { Id: '1' }, isPlaying: false, isReconnecting: false });
    expect(player.replace).not.toHaveBeenCalled();
    connectivity.changeNetwork();
    expect(player.replace).not.toHaveBeenCalled();

    // Resumed: the minutes-old buffer is dropped for the live stream.
    player.emitStatus({ playing: true });
    expect(player.replace).toHaveBeenCalledTimes(1);
  });

  it('resumes a short pause where it was', async () => {
    const player = await playing();
    player.emitStatus({ playing: false, isBuffering: false });
    await jest.advanceTimersByTimeAsync(STREAM_LIVE_RESUME_RELOAD_MS - 1_000);
    player.emitStatus({ playing: true });
    expect(player.replace).not.toHaveBeenCalled();
  });

  it('stops reconnecting when the member stops the stream', async () => {
    const player = await playing();
    player.emitStatus({ error: 'Source error' });
    await useAudioStreamStore.getState().stopStream();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(player.replace).not.toHaveBeenCalled();
    connectivity.changeNetwork();
    expect(player.replace).not.toHaveBeenCalled();
  });
});
