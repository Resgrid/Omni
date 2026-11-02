import { canConnectToVoiceSession, getDepartmentVoiceSettings } from '@resgrid/api';
import { logger } from '@resgrid/core';
import type { DepartmentVoiceChannelResultData } from '@resgrid/models';
import type { Participant, Room } from 'livekit-client';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { resolveAudioRouteTarget } from '../audio/audio-route';
import { applyAudioRouting, releaseRecordingSession, startAudioSession, stopAudioSession } from '../audio/audio-session';
import { voiceSounds } from '../audio/voice-sounds';
import { useBluetoothAudioStore } from '../bluetooth/bluetooth-audio-store';
import { getBluetoothAudioService } from '../bluetooth/bluetooth-service';
import { getCallKeepService } from '../callkeep/callkeep-service';
import { getVoiceCapabilities } from '../capabilities';
import { getHeadsetButtonService } from '../headset/headset-button-service';
import { type PttInputSource, registerMicrophoneController } from '../ptt/microphone-controller';
import { getVoiceRuntime } from '../runtime';
import { delay, errorMessage, errorName, VoiceTimeoutError, withTimeout } from '../util/async';
import { getLiveKitClient, loadLiveKitClient } from './livekit-client';
import { ensureMicrophonePermission, type MicrophonePermissionResult } from './microphone-permission';
import { attachRemoteAudio } from './remote-audio';
import { type VoiceError, voiceFail, voiceOk, type VoiceResult } from './types';

export type VoiceChannel = DepartmentVoiceChannelResultData;

/** The whole connect flow is abandoned (isConnecting reset) after this long, so the UI never sticks on "Connecting…". */
export const CONNECT_OVERALL_TIMEOUT_MS = 30_000;
export const ROOM_CONNECT_TIMEOUT_MS = 15_000;
export const PERMISSION_TIMEOUT_MS = 10_000;
export const AUDIO_SESSION_TIMEOUT_MS = 10_000;
/** CallKit mute actions this soon after a local change are echoes of it (Responder oscillation fix). */
export const CALLKEEP_MUTE_DEBOUNCE_MS = 500;
/** Let the disconnect chime play before CallKit tears the iOS audio session down (Responder). */
export const IOS_DISCONNECT_SOUND_DELAY_MS = 800;

export interface LiveKitState {
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  currentRoom: Room | null;
  currentRoomInfo: VoiceChannel | null;
  /** The last channel joined; `reconnect()` rejoins it after an unexpected drop. */
  lastRoomInfo: VoiceChannel | null;
  /** The local participant is an active speaker. */
  isTalking: boolean;
  /** Identities of the participants currently speaking (remote included). */
  activeSpeakerIdentities: string[];
  /** Transmitting: the local microphone is published and unmuted. */
  isMicrophoneEnabled: boolean;
  lastLocalMuteChangeTimestamp: number;

  isVoiceEnabled: boolean;
  voipServerWebsocketSslAddress: string;
  callerIdName: string;
  canConnectApiToken: string;
  canConnectToVoiceSession: boolean;
  availableRooms: VoiceChannel[];
  selectedRoomId: string | null;
  isLoadingSettings: boolean;
  settingsLoaded: boolean;
  settingsError: VoiceError | null;
  lastError: VoiceError | null;
  isBottomSheetVisible: boolean;

  fetchVoiceSettings: (options?: { forceRefresh?: boolean }) => Promise<VoiceResult>;
  fetchCanConnectToVoice: () => Promise<boolean>;
  selectRoom: (room: VoiceChannel | null) => void;
  setIsBottomSheetVisible: (visible: boolean) => void;
  clearError: () => void;
  ensureMicrophonePermission: () => Promise<MicrophonePermissionResult>;
  /** Join a channel (switching from the current one). `token` defaults to the channel's own token. */
  connectToRoom: (roomInfo: VoiceChannel, token?: string) => Promise<VoiceResult>;
  /** Rejoin the last channel (after an unexpected drop), with refreshed settings and token. */
  reconnect: () => Promise<VoiceResult>;
  disconnectFromRoom: () => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean, source?: PttInputSource) => Promise<void>;
  toggleMicrophone: (source?: PttInputSource) => Promise<void>;
  /** Press-and-hold: start transmitting. */
  startTransmitting: (source?: PttInputSource) => Promise<void>;
  /** Press-and-hold: stop transmitting. */
  stopTransmitting: (source?: PttInputSource) => Promise<void>;
  /** Logout / department switch: leave the channel and forget department voice settings. */
  reset: () => Promise<void>;
}

type LiveKitData = Omit<
  LiveKitState,
  | 'fetchVoiceSettings'
  | 'fetchCanConnectToVoice'
  | 'selectRoom'
  | 'setIsBottomSheetVisible'
  | 'clearError'
  | 'ensureMicrophonePermission'
  | 'connectToRoom'
  | 'reconnect'
  | 'disconnectFromRoom'
  | 'setMicrophoneEnabled'
  | 'toggleMicrophone'
  | 'startTransmitting'
  | 'stopTransmitting'
  | 'reset'
>;

export const createInitialLiveKitState = (): LiveKitData => ({
  isConnected: false,
  isConnecting: false,
  isReconnecting: false,
  currentRoom: null,
  currentRoomInfo: null,
  lastRoomInfo: null,
  isTalking: false,
  activeSpeakerIdentities: [],
  isMicrophoneEnabled: false,
  lastLocalMuteChangeTimestamp: 0,
  isVoiceEnabled: false,
  voipServerWebsocketSslAddress: '',
  callerIdName: '',
  canConnectApiToken: '',
  canConnectToVoiceSession: false,
  availableRooms: [],
  selectedRoomId: null,
  isLoadingSettings: false,
  settingsLoaded: false,
  settingsError: null,
  lastError: null,
  isBottomSheetVisible: false,
});

const DISCONNECTED_STATE = { isConnected: false, isReconnecting: false, currentRoom: null, currentRoomInfo: null, isMicrophoneEnabled: false, isTalking: false, activeSpeakerIdentities: [] as string[] };

/**
 * Every connect attempt gets a generation. Disconnecting, a newer attempt or the overall timeout bumps it, and an attempt
 * that resumes with a stale generation tears down the room it created instead of committing it: a late connect from a
 * previous room can never overwrite the current session (room-switch race fix).
 */
let connectGeneration = 0;
/** Detaches the committed room's web <audio> elements (no-op on native). */
let detachRemoteAudio: (() => void) | null = null;

const routeTarget = () => {
  const { connectedDevice, selectedAudioDevices } = useBluetoothAudioStore.getState();
  return resolveAudioRouteTarget({ connectedDevice, speaker: selectedAudioDevices.speaker });
};

const quietly = async (label: string, work: () => Promise<unknown> | unknown): Promise<void> => {
  try {
    await work();
  } catch (error) {
    logger.warn({ message: `${label} failed`, context: { error } });
  }
};

const microphoneError = (error: unknown): VoiceError => {
  const name = errorName(error) ?? '';
  const message = errorMessage(error);
  if (name === 'NotAllowedError' || /permission/i.test(message)) return { code: 'permission_denied', message, canAskAgain: false };
  if (name === 'NotFoundError' || /device not found/i.test(message)) return { code: 'microphone_unavailable', message };
  return { code: 'microphone_failed', message };
};

/**
 * LiveKit push-to-talk (omni-plan §7.8): Unit's store as the base — Android routing through InCallAudioModule, the
 * room-switch race fix, guarded post-connect steps, unexpected-drop cleanup — plus Responder's CallKeep mute sync
 * (both directions, debounced), headset-button PTT and recording-session release, and Dispatch's web pieces (remote
 * audio elements, browser microphone permission, listener stripping on teardown).
 */
export const useLiveKitStore = create<LiveKitState>((set, get) => {
  const currentRoomIs = (room: Room): boolean => get().currentRoom === room;

  /** Intentional teardown of a room: mark it gone first so its Disconnected event is not treated as a drop. */
  const leaveRoom = async (room: Room): Promise<void> => {
    set(DISCONNECTED_STATE);
    detachRemoteAudio?.();
    detachRemoteAudio = null;
    room.removeAllListeners();
    await room.disconnect();
  };

  const handleUnexpectedDisconnect = (room: Room, roomInfo: VoiceChannel): void => {
    logger.warn({ message: 'Voice channel dropped unexpectedly; resetting call state', context: { roomName: roomInfo.Name } });
    const callKeep = getCallKeepService();
    callKeep.setMuteStateCallback(null);
    callKeep.setEndCallCallback(null);
    void quietly('CallKeep endCall after drop', () => callKeep.endCall());
    getHeadsetButtonService().stopMonitoring('livekit');
    detachRemoteAudio?.();
    detachRemoteAudio = null;
    room.removeAllListeners();
    if (Platform.OS === 'android') void quietly('Stop foreground service after drop', () => getVoiceRuntime().foregroundService?.stop());
    void quietly('Stop audio session after drop', () => stopAudioSession());
    set({ ...DISCONNECTED_STATE, lastError: { code: 'disconnected', roomName: roomInfo.Name } });
  };

  const bindRoomEvents = (room: Room, roomInfo: VoiceChannel): void => {
    const { RoomEvent } = getLiveKitClient();
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      if (!currentRoomIs(room)) return;
      set({ isTalking: speakers.some((speaker) => speaker.sid === room.localParticipant.sid), activeSpeakerIdentities: speakers.map((speaker) => speaker.identity) });
    });
    room.on(RoomEvent.Reconnecting, () => {
      if (!currentRoomIs(room)) return;
      logger.warn({ message: 'Voice channel connection lost; LiveKit is reconnecting', context: { roomName: roomInfo.Name } });
      set({ isReconnecting: true });
    });
    room.on(RoomEvent.Reconnected, () => {
      if (!currentRoomIs(room)) return;
      logger.info({ message: 'Voice channel reconnected', context: { roomName: roomInfo.Name } });
      set({ isReconnecting: false, isMicrophoneEnabled: room.localParticipant.isMicrophoneEnabled });
      void applyAudioRouting(routeTarget());
      getBluetoothAudioService()?.ensurePttInputMonitoring('livekit reconnected');
    });
    room.on(RoomEvent.Disconnected, () => {
      // Fired for drops and for intentional disconnects; intentional paths clear currentRoom first.
      if (!currentRoomIs(room) || !get().isConnected) return;
      handleUnexpectedDisconnect(room, roomInfo);
    });
  };

  /** Everything after the room is live. Each step is guarded: a failure must not report a connected room as failed. */
  const afterConnect = async (room: Room, roomInfo: VoiceChannel): Promise<void> => {
    const capabilities = getVoiceCapabilities();
    const callKeep = getCallKeepService();
    const runtime = getVoiceRuntime();

    await quietly('Initial mute', async () => {
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setCameraEnabled(false);
    });

    if (callKeep.isEnabled) {
      // CallKit → app. Echoes of our own changes (within the debounce) and duplicates are dropped.
      callKeep.setMuteStateCallback((muted) => {
        const state = get();
        if (!currentRoomIs(room) || !state.isConnected) return;
        if (Date.now() - state.lastLocalMuteChangeTimestamp < CALLKEEP_MUTE_DEBOUNCE_MS) return;
        const shouldBeEnabled = !muted;
        if (room.localParticipant.isMicrophoneEnabled !== shouldBeEnabled) void state.setMicrophoneEnabled(shouldBeEnabled, 'callkeep');
      });
      callKeep.setEndCallCallback(() => {
        if (currentRoomIs(room)) void get().disconnectFromRoom();
      });
    }

    await quietly('Audio routing', () => applyAudioRouting(routeTarget()));
    await quietly('Connect sound', () => voiceSounds.play('connectedToAudioRoom'));

    if (Platform.OS === 'android' && runtime.foregroundService && currentRoomIs(room)) {
      await quietly('Start voice foreground service', () => runtime.foregroundService?.start());
    }

    if (callKeep.isEnabled && currentRoomIs(room)) {
      await quietly('Start CallKeep call', async () => {
        if (Platform.OS === 'android' && !(await callKeep.requestPhonePermissions())) return;
        await callKeep.startCall(roomInfo.Name || 'Voice Channel');
        // The user may have left while CallKit was registering the call: never leave a dangling system call.
        if (!currentRoomIs(room)) await callKeep.endCall();
        else await callKeep.setMuted(!room.localParticipant.isMicrophoneEnabled);
      });
    }

    if (capabilities.headsetButtonPtt && currentRoomIs(room)) getHeadsetButtonService().startMonitoring('livekit');
    getBluetoothAudioService()?.ensurePttInputMonitoring('livekit connected');
  };

  const runConnect = async (roomInfo: VoiceChannel, token: string, generation: number): Promise<VoiceResult> => {
    const stale = (): boolean => generation !== connectGeneration;
    const cancelled = (): VoiceResult => voiceFail({ code: 'cancelled', roomName: roomInfo.Name });
    const failed = (error: VoiceError): VoiceResult => {
      if (!stale()) set({ isConnecting: false, lastError: error });
      return voiceFail(error);
    };

    let room: Room | null = null;
    let detachAudio: (() => void) | null = null;
    let audioSessionStarted = false;
    const discardRoom = async (): Promise<void> => {
      detachAudio?.();
      if (room) {
        room.removeAllListeners();
        await room.disconnect().catch(() => undefined);
      }
      if (audioSessionStarted) await stopAudioSession().catch(() => undefined);
    };

    try {
      const { voipServerWebsocketSslAddress: serverUrl } = get();
      if (!serverUrl) return failed({ code: 'no_server', roomName: roomInfo.Name });
      if (!token) return failed({ code: 'no_token', roomName: roomInfo.Name });

      const permission = await withTimeout(ensureMicrophonePermission(), PERMISSION_TIMEOUT_MS, 'microphone permission');
      if (stale()) return cancelled();
      if (!permission.granted) return failed({ code: 'permission_denied', canAskAgain: permission.canAskAgain, roomName: roomInfo.Name });

      getBluetoothAudioService()?.ensurePttInputMonitoring('livekit connect start');

      // Switching channels: leave the current room (CallKeep/FGS stay up for the new one).
      const previous = get().currentRoom;
      if (previous) await leaveRoom(previous);
      if (stale()) return cancelled();

      if (Platform.OS !== 'web') {
        try {
          await withTimeout(startAudioSession(), AUDIO_SESSION_TIMEOUT_MS, 'AudioSession.startAudioSession');
          audioSessionStarted = true;
        } catch (error) {
          logger.warn({ message: 'Audio session did not start; connecting anyway', context: { error } });
        }
      }

      // livekit-client loads with the first connection (a separate chunk on web).
      const livekit = await loadLiveKitClient();
      if (stale()) {
        await discardRoom();
        return cancelled();
      }
      room = new livekit.Room();
      bindRoomEvents(room, roomInfo);
      detachAudio = attachRemoteAudio(room);

      await withTimeout(room.connect(serverUrl, token), ROOM_CONNECT_TIMEOUT_MS, 'room.connect');
      if (stale()) {
        // A disconnect or newer attempt won while this connect was in flight.
        await discardRoom();
        return cancelled();
      }

      detachRemoteAudio = detachAudio;
      set({
        currentRoom: room,
        currentRoomInfo: roomInfo,
        lastRoomInfo: roomInfo,
        selectedRoomId: roomInfo.Id,
        isConnected: true,
        isConnecting: false,
        isReconnecting: false,
        isMicrophoneEnabled: false,
        lastLocalMuteChangeTimestamp: Date.now(),
        lastError: null,
      });
      logger.info({ message: 'Voice channel connected', context: { roomName: roomInfo.Name } });

      await afterConnect(room, roomInfo);
      return voiceOk;
    } catch (error) {
      logger.error({ message: 'Failed to connect to voice channel', context: { roomName: roomInfo.Name, error } });
      if (room && get().currentRoom !== room) await discardRoom();
      if (stale()) return cancelled();
      return failed({ code: error instanceof VoiceTimeoutError ? 'timeout' : 'connect_failed', message: errorMessage(error), roomName: roomInfo.Name });
    }
  };

  return {
    ...createInitialLiveKitState(),

    fetchVoiceSettings: async (options = {}) => {
      const ctx = getVoiceRuntime().getApiContext();
      if (!ctx) return voiceFail({ code: 'not_configured' });
      set({ isLoadingSettings: true });
      try {
        const response = await getDepartmentVoiceSettings(ctx, { forceRefresh: options.forceRefresh });
        const data = response?.Data;
        const enabled = Boolean(data?.VoiceEnabled);
        const rooms = enabled && Array.isArray(data?.Channels) ? [...data.Channels] : [];
        const selected = get().selectedRoomId;
        const selectedRoomId = rooms.some((room) => room.Id === selected) ? selected : ((rooms.find((room) => room.IsDefault) ?? rooms[0])?.Id ?? null);
        set({
          isVoiceEnabled: enabled,
          voipServerWebsocketSslAddress: data?.VoipServerWebsocketSslAddress ?? '',
          callerIdName: data?.CallerIdName ?? '',
          canConnectApiToken: data?.CanConnectApiToken ?? '',
          availableRooms: rooms,
          selectedRoomId,
          isLoadingSettings: false,
          settingsLoaded: true,
          settingsError: null,
        });
        return voiceOk;
      } catch (error) {
        logger.error({ message: 'Failed to fetch voice settings', context: { error } });
        const settingsError: VoiceError = { code: 'settings_failed', message: errorMessage(error) };
        set({ isLoadingSettings: false, settingsError });
        return voiceFail(settingsError);
      }
    },

    fetchCanConnectToVoice: async () => {
      const ctx = getVoiceRuntime().getApiContext();
      if (!ctx) return false;
      try {
        const response = await canConnectToVoiceSession(ctx, { token: get().canConnectApiToken });
        const canConnect = Boolean(response?.Data?.CanConnect);
        set({ canConnectToVoiceSession: canConnect });
        return canConnect;
      } catch (error) {
        logger.error({ message: 'Failed to check voice session capacity', context: { error } });
        set({ canConnectToVoiceSession: false });
        return false;
      }
    },

    selectRoom: (room) => set({ selectedRoomId: room?.Id ?? null }),
    setIsBottomSheetVisible: (isBottomSheetVisible) => set({ isBottomSheetVisible }),
    clearError: () => set({ lastError: null }),
    ensureMicrophonePermission: () => ensureMicrophonePermission(),

    connectToRoom: async (roomInfo, token) => {
      const state = get();
      if (!getVoiceCapabilities().ptt) return voiceFail({ code: 'voice_disabled', roomName: roomInfo.Name });
      if (state.isConnecting) return voiceFail({ code: 'busy', roomName: roomInfo.Name });
      if (state.isConnected && state.currentRoomInfo?.Id === roomInfo.Id) return voiceOk;

      const generation = ++connectGeneration;
      set({ isConnecting: true, lastError: null, selectedRoomId: roomInfo.Id });
      try {
        return await withTimeout(runConnect(roomInfo, token ?? roomInfo.Token, generation), CONNECT_OVERALL_TIMEOUT_MS, 'connectToRoom');
      } catch (error) {
        // Overall timeout: invalidate the attempt so it discards its room whenever it resumes.
        logger.error({ message: 'Voice connect timed out', context: { roomName: roomInfo.Name, error } });
        if (generation === connectGeneration) {
          connectGeneration++;
          set({ isConnecting: false });
        }
        const timeout: VoiceError = { code: 'timeout', roomName: roomInfo.Name };
        set({ lastError: timeout });
        return voiceFail(timeout);
      }
    },

    reconnect: async () => {
      const last = get().lastRoomInfo;
      if (!last) return voiceFail({ code: 'no_channel' });
      await get().fetchVoiceSettings({ forceRefresh: true });
      const fresh = get().availableRooms.find((room) => room.Id === last.Id) ?? last;
      return get().connectToRoom(fresh);
    },

    disconnectFromRoom: async () => {
      connectGeneration++;
      const { currentRoom } = get();
      if (!currentRoom) {
        if (get().isConnecting) set({ isConnecting: false });
        return;
      }
      const callKeep = getCallKeepService();
      try {
        getHeadsetButtonService().stopMonitoring('livekit');
        await quietly('Room disconnect', () => leaveRoom(currentRoom));
        await quietly('Disconnect sound', () => voiceSounds.play('disconnectedFromAudioRoom'));
        if (Platform.OS === 'ios' && callKeep.isEnabled) await delay(IOS_DISCONNECT_SOUND_DELAY_MS);
        if (Platform.OS !== 'web') await quietly('Stop audio session', () => stopAudioSession());
        await quietly('CallKeep endCall', () => callKeep.endCall());
        callKeep.setMuteStateCallback(null);
        callKeep.setEndCallCallback(null);
        if (Platform.OS === 'android') await quietly('Stop voice foreground service', () => getVoiceRuntime().foregroundService?.stop());
        if (Platform.OS !== 'web') await releaseRecordingSession();
      } finally {
        set({ ...DISCONNECTED_STATE, isConnecting: false });
      }
    },

    setMicrophoneEnabled: async (enabled, source = 'ui') => {
      const room = get().currentRoom;
      if (!room) {
        logger.debug({ message: 'Microphone change ignored: no voice channel', context: { enabled, source } });
        return;
      }
      if (room.state !== getLiveKitClient().ConnectionState.Connected) {
        logger.debug({ message: 'Microphone change ignored: room not connected', context: { enabled, state: room.state } });
        return;
      }
      if (room.localParticipant.isMicrophoneEnabled === enabled) {
        if (get().isMicrophoneEnabled !== enabled) set({ isMicrophoneEnabled: enabled });
        return;
      }
      try {
        await room.localParticipant.setMicrophoneEnabled(enabled);
        if (!currentRoomIs(room)) return;
        set({ isMicrophoneEnabled: enabled, lastLocalMuteChangeTimestamp: Date.now() });
        // App → CallKit (not for changes CallKit itself asked for).
        if (source !== 'callkeep') void quietly('CallKeep setMuted', () => getCallKeepService().setMuted(!enabled));
        await quietly('Transmit sound', () => voiceSounds.play(enabled ? 'startTransmitting' : 'stopTransmitting'));
      } catch (error) {
        logger.error({ message: 'Failed to change microphone state', context: { enabled, source, error } });
        set({ lastError: microphoneError(error) });
      }
    },

    toggleMicrophone: async (source = 'ui') => {
      const room = get().currentRoom;
      if (!room) return;
      await get().setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled, source);
    },

    startTransmitting: (source = 'ui') => get().setMicrophoneEnabled(true, source),
    stopTransmitting: (source = 'ui') => get().setMicrophoneEnabled(false, source),

    reset: async () => {
      await get().disconnectFromRoom();
      set(createInitialLiveKitState());
    },
  };
});

registerMicrophoneController({
  isActive: () => {
    const state = useLiveKitStore.getState();
    return state.isConnected && state.currentRoom !== null;
  },
  isConnecting: () => useLiveKitStore.getState().isConnecting,
  isMicrophoneEnabled: () => useLiveKitStore.getState().isMicrophoneEnabled,
  setMicrophoneEnabled: (enabled, source) => useLiveKitStore.getState().setMicrophoneEnabled(enabled, source),
  toggleMicrophone: (source) => useLiveKitStore.getState().toggleMicrophone(source),
});

// Re-route call audio when the Bluetooth device or the speaker selection changes mid-call (Responder).
useBluetoothAudioStore.subscribe((state, previous) => {
  if (state.selectedAudioDevices === previous.selectedAudioDevices && state.connectedDevice === previous.connectedDevice) return;
  if (useLiveKitStore.getState().isConnected) void applyAudioRouting(routeTarget());
});

/** The currently selected channel (falls back to the default / first channel). */
export const selectSelectedRoom = (state: Pick<LiveKitState, 'availableRooms' | 'selectedRoomId'>): VoiceChannel | null =>
  state.availableRooms.find((room) => room.Id === state.selectedRoomId) ?? state.availableRooms.find((room) => room.IsDefault) ?? state.availableRooms[0] ?? null;
