// Ported from Unit stores/app/__tests__/audio-stream-store.test.ts (+ Dispatch web store behaviour).
import { getDepartmentAudioStreams } from '@resgrid/api';

import { createAudioPlayer, FakeAudioPlayer, setAudioModeAsync } from '../../__tests__/fakes/expo-audio';
import { resetReactNativeFake } from '../../__tests__/fakes/react-native';
import { activateVariant } from '../../__tests__/helpers/variant';
import { useLiveKitStore } from '../../livekit/livekit-store';
import { configureVoice, resetVoiceRuntimeForTests } from '../../runtime';
import { base64Encode } from '../../util/bytes';
import { useAudioStreamStore } from '../audio-stream-store';
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

  it('releases the player and resets when playback errors', async () => {
    await useAudioStreamStore.getState().playStream(stream('1'));
    const player = lastPlayer();
    player.emitStatus({ error: 'Source error' });
    expect(player.remove).toHaveBeenCalled();
    expect(useAudioStreamStore.getState()).toMatchObject({ currentStream: null, isPlaying: false, error: { code: 'playback_failed' } });
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
