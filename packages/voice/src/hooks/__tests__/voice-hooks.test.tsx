// Hooks over the voice stores (Dispatch use-ptt.test.ts adapted to the store-backed hooks).
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { activateVariant } from '../../__tests__/helpers/variant';
import { useAudioStreamStore } from '../../audio-streams/audio-stream-store';
import { useBluetoothAudioStore } from '../../bluetooth/bluetooth-audio-store';
import { createInitialLiveKitState, useLiveKitStore } from '../../livekit/livekit-store';
import { useAudioStreams } from '../use-audio-streams';
import { usePtt } from '../use-ptt';
import { useVoiceChannels } from '../use-voice-channels';
import { deriveVoiceStatus, useVoiceStatus } from '../use-voice-status';

jest.mock('@resgrid/api', () => ({ getDepartmentVoiceSettings: jest.fn(), canConnectToVoiceSession: jest.fn(), getDepartmentAudioStreams: jest.fn() }));

const channel = (id: string, extra: object = {}) => ({ Id: id, Name: `Channel ${id}`, ConferenceNumber: 0, IsDefault: false, Token: `t-${id}`, ...extra });

beforeEach(() => {
  activateVariant('unit');
  useLiveKitStore.setState(createInitialLiveKitState());
  useBluetoothAudioStore.getState().reset();
});

describe('useVoiceChannels', () => {
  it('fetches settings on mount once and exposes the selected and default channels', async () => {
    const fetchVoiceSettings = jest.fn(async () => {
      useLiveKitStore.setState({ settingsLoaded: true, isVoiceEnabled: true, availableRooms: [channel('1'), channel('2', { IsDefault: true })], selectedRoomId: '2' });
      return { ok: true as const };
    });
    useLiveKitStore.setState({ fetchVoiceSettings });

    const { result } = renderHook(() => useVoiceChannels());

    await waitFor(() => expect(result.current.channels).toHaveLength(2));
    expect(fetchVoiceSettings).toHaveBeenCalledTimes(1);
    expect(result.current.isVoiceEnabled).toBe(true);
    expect(result.current.selectedChannel?.Id).toBe('2');
    expect(result.current.defaultChannel?.Id).toBe('2');

    act(() => result.current.selectChannel(channel('1')));
    expect(result.current.selectedChannel?.Id).toBe('1');

    await act(async () => {
      await result.current.refresh();
    });
    expect(fetchVoiceSettings).toHaveBeenLastCalledWith({ forceRefresh: true });
  });

  it('does not fetch for variants without PTT', () => {
    activateVariant('bigboard');
    const fetchVoiceSettings = jest.fn(async () => ({ ok: true as const }));
    useLiveKitStore.setState({ fetchVoiceSettings, isVoiceEnabled: true });
    const { result } = renderHook(() => useVoiceChannels());
    expect(fetchVoiceSettings).not.toHaveBeenCalled();
    expect(result.current.isVoiceEnabled).toBe(false);
  });
});

describe('usePtt', () => {
  it('connects the selected channel and maps press-and-hold to the store', async () => {
    const connectToRoom = jest.fn(async () => ({ ok: true as const }));
    const setMicrophoneEnabled = jest.fn(async () => undefined);
    const toggleMicrophone = jest.fn(async () => undefined);
    useLiveKitStore.setState({ connectToRoom, setMicrophoneEnabled, toggleMicrophone, availableRooms: [channel('1'), channel('2')], selectedRoomId: '2' });

    const { result } = renderHook(() => usePtt());
    await act(async () => {
      await result.current.connect();
    });
    expect(connectToRoom).toHaveBeenCalledWith(expect.objectContaining({ Id: '2' }));

    await act(async () => {
      await result.current.startTransmitting();
      await result.current.stopTransmitting();
      await result.current.toggleTransmitting();
    });
    expect(setMicrophoneEnabled).toHaveBeenNthCalledWith(1, true, 'ui');
    expect(setMicrophoneEnabled).toHaveBeenNthCalledWith(2, false, 'ui');
    expect(toggleMicrophone).toHaveBeenCalledWith('ui');
  });

  it('reports no_channel when there is nothing to join', async () => {
    const { result } = renderHook(() => usePtt());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.connect();
    });
    expect(outcome).toEqual({ ok: false, error: { code: 'no_channel' } });
  });

  it('reflects connection and transmit state', () => {
    const { result } = renderHook(() => usePtt());
    expect(result.current).toMatchObject({ isConnected: false, isTransmitting: false, canTransmit: false });
    act(() => useLiveKitStore.setState({ isConnected: true, isMicrophoneEnabled: true, currentRoomInfo: channel('1') }));
    expect(result.current).toMatchObject({ isConnected: true, isTransmitting: true, canTransmit: true, currentChannel: { Id: '1' } });
    act(() => useLiveKitStore.setState({ isReconnecting: true }));
    expect(result.current.canTransmit).toBe(false);
  });
});

describe('useVoiceStatus', () => {
  it('derives one status from the stores', () => {
    const { result } = renderHook(() => useVoiceStatus());
    expect(result.current.status).toBe('unavailable');
    act(() => useLiveKitStore.setState({ isVoiceEnabled: true }));
    expect(result.current.status).toBe('idle');
    act(() => useLiveKitStore.setState({ isConnected: true, currentRoomInfo: channel('9'), activeSpeakerIdentities: ['remote-1'] }));
    expect(result.current).toMatchObject({ status: 'connected', channelName: 'Channel 9', isSomeoneTalking: true });
    act(() => useLiveKitStore.setState({ isMicrophoneEnabled: true }));
    expect(result.current.status).toBe('transmitting');
  });

  it('maps every state', () => {
    const base = { pttCapable: true, isVoiceEnabled: true, isConnecting: false, isConnected: false, isReconnecting: false, isMicrophoneEnabled: false };
    expect(deriveVoiceStatus({ ...base, pttCapable: false })).toBe('unavailable');
    expect(deriveVoiceStatus({ ...base, isConnecting: true })).toBe('connecting');
    expect(deriveVoiceStatus({ ...base, isConnected: true, isReconnecting: true })).toBe('reconnecting');
  });
});

describe('useAudioStreams', () => {
  it('fetches on mount and toggles a stream', async () => {
    const stream = { Id: 's1', Name: 'Scanner', Type: 'mp3', Url: 'https://a/s1' };
    const fetchAvailableStreams = jest.fn(async () => {
      useAudioStreamStore.setState({ availableStreams: [stream] });
    });
    const playStream = jest.fn(async () => {
      useAudioStreamStore.setState({ currentStream: stream, isPlaying: true });
      return true;
    });
    const stopStream = jest.fn(async () => {
      useAudioStreamStore.setState({ currentStream: null, isPlaying: false });
    });
    useAudioStreamStore.setState({ fetchAvailableStreams, playStream, stopStream, currentStream: null, availableStreams: [] });

    const { result } = renderHook(() => useAudioStreams());
    await waitFor(() => expect(result.current.streams).toHaveLength(1));

    await act(async () => {
      await result.current.toggle(stream);
    });
    expect(playStream).toHaveBeenCalledWith(stream);
    expect(result.current.isPlaying).toBe(true);

    await act(async () => {
      await result.current.toggle(stream);
    });
    expect(stopStream).toHaveBeenCalled();
    expect(result.current.currentStream).toBeNull();
  });
});
