/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import '../../calls/__tests__/test-setup';

import type { DepartmentAudioResultStreamData, DepartmentVoiceChannelResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { useAudioStreamStore, useLiveKitStore } from '@resgrid/voice';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { AudioStreamSheet } from '../components/audio-stream-sheet';
import { VoiceChannelSheet } from '../components/voice-channel-sheet';

interface MockChannel {
  Id: string;
  Name: string;
}

interface MockStream {
  Id: string;
  Name: string;
  Type: string;
}

// LiveKit and the stream players have native modules: zustand stand-ins with the fields and actions the sheets use.
// `usePtt` is a view over the LiveKit stand-in, as the real hook is over the real store.
jest.mock('@resgrid/voice', () => {
  const { create } = require('zustand');
  const noChannels: MockChannel[] = [];
  const noChannel: MockChannel | null = null;
  const noStreams: MockStream[] = [];
  const noStream: MockStream | null = null;

  const mockLiveKitStore = create(() => ({
    isBottomSheetVisible: false,
    availableRooms: noChannels,
    isLoadingSettings: false,
    isConnected: false,
    isConnecting: false,
    isTalking: false,
    isMicrophoneEnabled: false,
    currentRoomInfo: noChannel,
    fetchVoiceSettings: jest.fn(async () => ({ ok: true })),
    connectToRoom: jest.fn(async () => ({ ok: true })),
    disconnectFromRoom: jest.fn(async () => undefined),
    toggleMicrophone: jest.fn(async () => undefined),
    setIsBottomSheetVisible: jest.fn((visible: boolean) => mockLiveKitStore.setState({ isBottomSheetVisible: visible })),
  }));

  const mockBluetoothAudioStore = create(() => ({ selectedAudioDevices: { microphone: { name: 'Headset mic' }, speaker: null } }));

  const mockAudioStreamStore = create(() => ({
    isBottomSheetVisible: false,
    availableStreams: noStreams,
    currentStream: noStream,
    isLoadingStreams: false,
    isPlaying: false,
    isLoading: false,
    isBuffering: false,
    fetchAvailableStreams: jest.fn(async () => undefined),
    playStream: jest.fn(async () => true),
    stopStream: jest.fn(async () => undefined),
    setIsBottomSheetVisible: jest.fn((visible: boolean) => mockAudioStreamStore.setState({ isBottomSheetVisible: visible })),
  }));

  const usePtt = () => {
    const state = mockLiveKitStore();

    return {
      isConnected: state.isConnected,
      isConnecting: state.isConnecting,
      isTransmitting: state.isMicrophoneEnabled,
      currentChannel: state.currentRoomInfo,
      connect: state.connectToRoom,
      disconnect: state.disconnectFromRoom,
      toggleTransmitting: state.toggleMicrophone,
    };
  };

  return { useLiveKitStore: mockLiveKitStore, useBluetoothAudioStore: mockBluetoothAudioStore, useAudioStreamStore: mockAudioStreamStore, usePtt };
});

const CHANNELS: DepartmentVoiceChannelResultData[] = [
  { Id: 'c1', Name: 'Command', ConferenceNumber: 1, IsDefault: true, Token: 'token-1' },
  { Id: 'c2', Name: 'Tactical 2', ConferenceNumber: 2, IsDefault: false, Token: 'token-2' },
];

const STREAMS: DepartmentAudioResultStreamData[] = [
  { Id: 's1', Name: 'County Fire', Type: 'Scanner', Url: 'https://streams.example.test/s1' },
  { Id: 's2', Name: 'EMS', Type: '', Url: 'https://streams.example.test/s2' },
];

beforeEach(() => {
  jest.clearAllMocks();
  activateVariant('unit');
  useLiveKitStore.setState({
    isBottomSheetVisible: false,
    availableRooms: CHANNELS,
    isLoadingSettings: false,
    isConnected: false,
    isConnecting: false,
    isTalking: false,
    isMicrophoneEnabled: false,
    currentRoomInfo: null,
  });
  useAudioStreamStore.setState({ isBottomSheetVisible: false, availableStreams: STREAMS, currentStream: null, isLoadingStreams: false, isPlaying: false, isLoading: false, isBuffering: false });
});

// Toasts arm timers; clearing them lets the worker exit.
afterEach(() => useToastStore.getState().clearToasts());

describe('VoiceChannelSheet', () => {
  it('opens from the store, reloads the channels and joins the one tapped', async () => {
    await render(<VoiceChannelSheet />);
    expect(screen.queryByTestId('voice-channel-sheet-channels', hidden)).toBeNull();

    await act(() => useLiveKitStore.getState().setIsBottomSheetVisible(true));
    expect(useLiveKitStore.getState().fetchVoiceSettings).toHaveBeenCalledWith({ forceRefresh: true });
    expect(screen.getByTestId('voice-channel-sheet-channel-c2', hidden)).toHaveTextContent('Tactical 2', { exact: false });
    await fireEvent.press(screen.getByTestId('voice-channel-sheet-join-c2', hidden));
    expect(useLiveKitStore.getState().connectToRoom).toHaveBeenCalledWith(CHANNELS[1]);
  });

  it('says when the department has no channels, and when joining failed', async () => {
    useLiveKitStore.setState({ isBottomSheetVisible: true, availableRooms: [] });
    await render(<VoiceChannelSheet />);
    expect(screen.getByTestId('voice-channel-sheet-empty', hidden)).toHaveTextContent('livekit.no_rooms_available');

    jest.mocked(useLiveKitStore.getState().connectToRoom).mockResolvedValueOnce({ ok: false, error: { code: 'connect_failed' } });
    await act(() => useLiveKitStore.setState({ availableRooms: CHANNELS }));
    await fireEvent.press(screen.getByTestId('voice-channel-sheet-join-c1', hidden));
    await waitFor(() => expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('livekit.join_failed'));
  });

  it('shows the joined channel with mute, audio settings and disconnect', async () => {
    useLiveKitStore.setState({ isBottomSheetVisible: true, isConnected: true, isTalking: true, currentRoomInfo: CHANNELS[0] });
    await render(<VoiceChannelSheet />);
    expect(screen.getByTestId('voice-channel-sheet-channel', hidden)).toHaveTextContent('Command');
    expect(screen.getByTestId('voice-channel-sheet-speaking', hidden)).toBeTruthy();
    expect(screen.getByText('Headset mic', hidden)).toBeTruthy();

    const mute = screen.getByTestId('voice-channel-sheet-mute', hidden);
    expect(mute).toHaveAccessibleName('livekit.unmute');
    await fireEvent.press(mute);
    expect(useLiveKitStore.getState().toggleMicrophone).toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('voice-channel-sheet-disconnect', hidden));
    expect(useLiveKitStore.getState().disconnectFromRoom).toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('voice-channel-sheet-audio-settings', hidden));
    expect(useLiveKitStore.getState().isBottomSheetVisible).toBe(false);
    expect(router.push).toHaveBeenCalledWith('/settings');
  });

  it('renders nothing in an app without push-to-talk', async () => {
    activateVariant('bigboard');
    useLiveKitStore.setState({ isBottomSheetVisible: true });
    await render(<VoiceChannelSheet />);
    expect(screen.queryByTestId('voice-channel-sheet', hidden)).toBeNull();
    expect(useLiveKitStore.getState().fetchVoiceSettings).not.toHaveBeenCalled();
  });
});

describe('AudioStreamSheet', () => {
  it('lists None and the department streams, and plays the one picked', async () => {
    useAudioStreamStore.setState({ isBottomSheetVisible: true });
    await render(<AudioStreamSheet />);
    expect(screen.getByTestId('audio-stream-sheet-status', hidden)).toHaveTextContent('audio_streams.no_stream_playing');
    expect(screen.getByTestId('audio-stream-sheet-stream-none', hidden)).toBeChecked();
    await fireEvent.press(screen.getByTestId('audio-stream-sheet-stream-s1', hidden));
    expect(useAudioStreamStore.getState().playStream).toHaveBeenCalledWith(STREAMS[0]);
    expect(useAudioStreamStore.getState().fetchAvailableStreams).not.toHaveBeenCalled();
  });

  it('shows what is playing and stops it with None', async () => {
    useAudioStreamStore.setState({ isBottomSheetVisible: true, currentStream: STREAMS[0], isPlaying: true });
    await render(<AudioStreamSheet />);
    expect(screen.getByTestId('audio-stream-sheet-status', hidden)).toHaveTextContent('audio_streams.currently_playing:County Fire');
    expect(screen.getByTestId('audio-stream-sheet-stream-s1', hidden)).toBeChecked();
    expect(screen.getByTestId('audio-stream-sheet-playback', hidden)).toHaveTextContent('audio_streams.playing');
    await fireEvent.press(screen.getByTestId('audio-stream-sheet-stream-s1', hidden));
    expect(useAudioStreamStore.getState().playStream).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('audio-stream-sheet-stream-none', hidden));
    expect(useAudioStreamStore.getState().stopStream).toHaveBeenCalled();
  });

  it('loads the streams when it opens without any, offers a refresh, and closes', async () => {
    useAudioStreamStore.setState({ availableStreams: [] });
    await render(<AudioStreamSheet />);
    await act(() => useAudioStreamStore.getState().setIsBottomSheetVisible(true));
    expect(useAudioStreamStore.getState().fetchAvailableStreams).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('audio-stream-sheet-refresh', hidden));
    expect(useAudioStreamStore.getState().fetchAvailableStreams).toHaveBeenLastCalledWith({ forceRefresh: true });
    await fireEvent.press(screen.getByTestId('audio-stream-sheet-close', hidden));
    expect(useAudioStreamStore.getState().isBottomSheetVisible).toBe(false);
  });

  it('holds the other streams while one is starting or buffering, but None still stops it', async () => {
    useAudioStreamStore.setState({ isBottomSheetVisible: true, currentStream: STREAMS[0], isLoading: true });
    await render(<AudioStreamSheet />);
    expect(screen.getByTestId('audio-stream-sheet-status', hidden)).toHaveTextContent('audio_streams.loading_stream');
    expect(screen.getByTestId('audio-stream-sheet-stream-s2', hidden)).toBeDisabled();
    await fireEvent.press(screen.getByTestId('audio-stream-sheet-stream-s2', hidden));
    expect(useAudioStreamStore.getState().playStream).not.toHaveBeenCalled();

    // A stream stalled on a weak connection stays buffering: None is the way out.
    await act(() => useAudioStreamStore.setState({ isLoading: false, isBuffering: true }));
    expect(screen.getByTestId('audio-stream-sheet-stream-none', hidden)).toBeEnabled();
    await fireEvent.press(screen.getByTestId('audio-stream-sheet-stream-none', hidden));
    expect(useAudioStreamStore.getState().stopStream).toHaveBeenCalled();
  });
});
