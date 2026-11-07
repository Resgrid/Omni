// Ported and adapted from Unit stores/app/__tests__/livekit-store.test.ts + livekit-store-room-switch.test.ts and
// Responder livekit-store tests: connect/transmit/release, room-switch race, drops, reconnect, routing, CallKeep sync.
import { getDepartmentVoiceSettings } from '@resgrid/api';
import type { DepartmentVoiceChannelResultData } from '@resgrid/models';

import { setAudioModeAsync } from '../../__tests__/fakes/expo-audio';
import { DisconnectReason, Room as FakeRoom, RoomEvent } from '../../__tests__/fakes/livekit-client';
import { AudioSession } from '../../__tests__/fakes/livekit-react-native';
import { DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform, resetReactNativeFake } from '../../__tests__/fakes/react-native';
import RNCallKeep, { emitCallKeepEvent, resetCallKeepFake } from '../../__tests__/fakes/react-native-callkeep';
import { createTestConnectivity, type TestConnectivity } from '../../__tests__/helpers/connectivity';
import { activateVariant } from '../../__tests__/helpers/variant';
import { useBluetoothAudioStore } from '../../bluetooth/bluetooth-audio-store';
import { resetBluetoothAudioServiceForTests } from '../../bluetooth/bluetooth-service';
import { getCallKeepService, resetCallKeepServiceForTests } from '../../callkeep/callkeep-service';
import { getHeadsetButtonService, resetHeadsetButtonServiceForTests } from '../../headset/headset-button-service';
import { getMicrophoneController } from '../../ptt/microphone-controller';
import { configureVoice, resetVoiceRuntimeForTests } from '../../runtime';
import * as livekitClient from '../livekit-client';
import { createInitialLiveKitState, MAX_REJOIN_ATTEMPTS, resetLiveKitSessionForTests, SYSTEM_CALL_END_SETTLE_MS, useLiveKitStore } from '../livekit-store';

jest.mock('@resgrid/api', () => ({ getDepartmentVoiceSettings: jest.fn(), canConnectToVoiceSession: jest.fn(), getDepartmentAudioStreams: jest.fn() }));

const mockGetSettings = getDepartmentVoiceSettings as jest.Mock;

const channel = (id: string, name: string, extra: Partial<DepartmentVoiceChannelResultData> = {}): DepartmentVoiceChannelResultData => ({
  Id: id,
  Name: name,
  ConferenceNumber: 0,
  IsDefault: false,
  Token: `token-${id}`,
  ...extra,
});

const flush = async (times = 5): Promise<void> => {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setImmediate(resolve));
};

const inCallAudio = { setAudioRoute: jest.fn(async () => undefined), loadSound: jest.fn(), playSound: jest.fn(), initializeAudio: jest.fn(), cleanup: jest.fn(), isInPhoneCall: jest.fn(async () => false) };
const foregroundService = { start: jest.fn(async () => undefined), stop: jest.fn(async () => undefined) };
const ctx = { http: {} } as never;

const lastRoom = (): FakeRoom => FakeRoom.instances[FakeRoom.instances.length - 1] as FakeRoom;

const voiceSettings = (token: string) => ({
  Data: { VoiceEnabled: true, VoipServerWebsocketSslAddress: 'wss://voice.example.com', CallerIdName: '', CanConnectApiToken: '', Channels: [channel('1', 'Fireground', { Token: token })] },
});

beforeEach(async () => {
  resetReactNativeFake();
  resetLiveKitSessionForTests();
  FakeRoom.reset();
  foregroundService.start.mockClear();
  foregroundService.stop.mockClear();
  mockGetSettings.mockReset();
  resetCallKeepFake();
  resetCallKeepServiceForTests();
  resetHeadsetButtonServiceForTests();
  resetBluetoothAudioServiceForTests();
  resetVoiceRuntimeForTests();
  activateVariant('unit');
  NativeModules.InCallAudioModule = inCallAudio;
  configureVoice({ getApiContext: () => ctx, foregroundService });
  useLiveKitStore.setState({ ...createInitialLiveKitState(), voipServerWebsocketSslAddress: 'wss://voice.example.com' });
  useBluetoothAudioStore.getState().reset();
  await getCallKeepService().setup({
    appName: 'Resgrid Unit',
    android: { alertTitle: 't', alertDescription: 'd', cancelButton: 'c', okButton: 'o', foregroundService: { channelId: 'call', channelName: 'Call', notificationTitle: 'n' } },
  });
});

describe('connect, transmit, release', () => {
  it('joins a channel muted, starts the audio session, routes audio, starts the FGS and the CallKeep call', async () => {
    const result = await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));

    expect(result).toEqual({ ok: true });
    const room = lastRoom();
    expect(room.connect).toHaveBeenCalledWith('wss://voice.example.com', 'token-1');
    expect(useLiveKitStore.getState()).toMatchObject({ isConnected: true, isConnecting: false, currentRoom: room, isMicrophoneEnabled: false, lastError: null });
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false);
    expect(AudioSession.startAudioSession).toHaveBeenCalled();
    expect(inCallAudio.setAudioRoute).toHaveBeenCalledWith('speaker');
    expect(inCallAudio.playSound).toHaveBeenCalledWith('connectedToAudioRoom');
    expect(foregroundService.start).toHaveBeenCalled();
    expect(RNCallKeep.startCall).toHaveBeenCalledWith(expect.any(String), 'Fireground', 'Fireground', 'generic', false);
    expect(RNCallKeep.setMutedCall).toHaveBeenLastCalledWith(expect.any(String), true);
    expect(getHeadsetButtonService().isMonitoringActive()).toBe(true);
  });

  it('transmits on press and releases on press out, syncing CallKit and playing the chimes', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    const room = lastRoom();
    const uuid = getCallKeepService().getCurrentCallUUID();

    await useLiveKitStore.getState().startTransmitting();
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    expect(useLiveKitStore.getState().isMicrophoneEnabled).toBe(true);
    expect(RNCallKeep.setMutedCall).toHaveBeenLastCalledWith(uuid, false);
    expect(inCallAudio.playSound).toHaveBeenLastCalledWith('startTransmitting');

    await useLiveKitStore.getState().stopTransmitting();
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    expect(useLiveKitStore.getState().isMicrophoneEnabled).toBe(false);
    expect(RNCallKeep.setMutedCall).toHaveBeenLastCalledWith(uuid, true);
    expect(inCallAudio.playSound).toHaveBeenLastCalledWith('stopTransmitting');
  });

  it('toggles the microphone and exposes the store as the PTT microphone controller', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    const controller = getMicrophoneController();
    expect(controller?.isActive()).toBe(true);
    await controller?.toggleMicrophone('headset');
    expect(useLiveKitStore.getState().isMicrophoneEnabled).toBe(true);
    await useLiveKitStore.getState().toggleMicrophone();
    expect(useLiveKitStore.getState().isMicrophoneEnabled).toBe(false);
  });

  it('ignores microphone changes when no room is connected', async () => {
    await useLiveKitStore.getState().startTransmitting();
    expect(useLiveKitStore.getState().isMicrophoneEnabled).toBe(false);
    expect(FakeRoom.instances).toHaveLength(0);
  });

  it('reports a missing microphone as a code instead of throwing', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    const error = Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' });
    lastRoom().localParticipant.setMicrophoneEnabled.mockRejectedValueOnce(error);
    await useLiveKitStore.getState().startTransmitting();
    expect(useLiveKitStore.getState().lastError).toMatchObject({ code: 'microphone_unavailable' });
  });

  it('disconnects cleanly: room, chime, audio session, CallKeep, FGS, headset monitoring', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    const room = lastRoom();
    await useLiveKitStore.getState().disconnectFromRoom();

    expect(room.disconnect).toHaveBeenCalled();
    expect(inCallAudio.playSound).toHaveBeenLastCalledWith('disconnectedFromAudioRoom');
    expect(AudioSession.stopAudioSession).toHaveBeenCalled();
    expect(RNCallKeep.endCall).toHaveBeenCalled();
    expect(foregroundService.stop).toHaveBeenCalled();
    expect(getHeadsetButtonService().isMonitoringActive()).toBe(false);
    expect(useLiveKitStore.getState()).toMatchObject({ isConnected: false, currentRoom: null, currentRoomInfo: null, lastError: null });
  });
});

describe('connect failures', () => {
  it('returns permission_denied (with canAskAgain) and creates no room', async () => {
    PermissionsAndroid.check.mockImplementation(async () => false);
    PermissionsAndroid.request.mockImplementation(async () => 'never_ask_again');

    const result = await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));

    expect(result).toEqual({ ok: false, error: { code: 'permission_denied', canAskAgain: false, roomName: 'Fireground' } });
    expect(FakeRoom.instances).toHaveLength(0);
    expect(useLiveKitStore.getState().isConnecting).toBe(false);
  });

  it('returns no_server without a VoIP address and no_token without a token', async () => {
    useLiveKitStore.setState({ voipServerWebsocketSslAddress: '' });
    expect(await useLiveKitStore.getState().connectToRoom(channel('1', 'A'))).toMatchObject({ ok: false, error: { code: 'no_server' } });
    useLiveKitStore.setState({ voipServerWebsocketSslAddress: 'wss://voice.example.com' });
    expect(await useLiveKitStore.getState().connectToRoom(channel('1', 'A', { Token: '' }))).toMatchObject({ ok: false, error: { code: 'no_token' } });
  });

  it('tears down the room it created when connect fails, so no live room leaks', async () => {
    FakeRoom.nextConnect = [new Error('connect refused')];

    const result = await useLiveKitStore.getState().connectToRoom(channel('1', 'Bad'));

    expect(result).toMatchObject({ ok: false, error: { code: 'connect_failed', message: 'connect refused' } });
    expect(lastRoom().disconnect).toHaveBeenCalled();
    expect(AudioSession.stopAudioSession).toHaveBeenCalled();
    expect(useLiveKitStore.getState()).toMatchObject({ currentRoom: null, isConnecting: false, isConnected: false });
  });

  it('stops the audio session it started when livekit-client fails to load', async () => {
    const load = jest.spyOn(livekitClient, 'loadLiveKitClient').mockRejectedValueOnce(new Error('chunk failed'));

    const result = await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));

    expect(result).toMatchObject({ ok: false, error: { code: 'connect_failed', message: 'chunk failed' } });
    expect(FakeRoom.instances).toHaveLength(0);
    expect(AudioSession.startAudioSession).toHaveBeenCalled();
    expect(AudioSession.stopAudioSession).toHaveBeenCalled();
    expect(useLiveKitStore.getState()).toMatchObject({ currentRoom: null, isConnecting: false, isConnected: false });
    load.mockRestore();
  });

  it('swallows a disconnect failure in the error path rather than masking the original error', async () => {
    FakeRoom.nextConnect = [new Error('connect refused')];
    FakeRoom.onCreate = (room) => room.disconnect.mockRejectedValueOnce(new Error('disconnect also failed'));
    await expect(useLiveKitStore.getState().connectToRoom(channel('1', 'Bad'))).resolves.toMatchObject({ ok: false, error: { code: 'connect_failed', message: 'connect refused' } });
    expect(lastRoom().disconnect).toHaveBeenCalled();
    expect(useLiveKitStore.getState().isConnecting).toBe(false);
  });

  it('rejects a second connect while one is in flight', async () => {
    FakeRoom.nextConnect = ['hold'];
    const first = useLiveKitStore.getState().connectToRoom(channel('1', 'A'));
    await flush();
    expect(await useLiveKitStore.getState().connectToRoom(channel('2', 'B'))).toMatchObject({ ok: false, error: { code: 'busy' } });
    lastRoom().resolveConnect();
    await expect(first).resolves.toEqual({ ok: true });
  });
});

describe('room switch race', () => {
  it('marks the old room disconnected before leaving it, without running drop cleanup', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('old', 'Old Room'));
    const oldRoom = lastRoom();
    let connectedDuringOldDisconnect: boolean | undefined;
    oldRoom.disconnect.mockImplementationOnce(async () => {
      connectedDuringOldDisconnect = useLiveKitStore.getState().isConnected;
      oldRoom.emit(RoomEvent.Disconnected);
    });
    foregroundService.stop.mockClear();

    await useLiveKitStore.getState().connectToRoom(channel('new', 'New Room'));
    const newRoom = lastRoom();

    expect(connectedDuringOldDisconnect).toBe(false);
    expect(foregroundService.stop).not.toHaveBeenCalled();
    expect(useLiveKitStore.getState()).toMatchObject({ currentRoom: newRoom, isConnected: true, lastError: null });
    expect(newRoom).not.toBe(oldRoom);
  });

  it('ignores a late connect from a cancelled attempt after the next channel is live', async () => {
    FakeRoom.nextConnect = ['hold', 'resolve'];
    const first = useLiveKitStore.getState().connectToRoom(channel('a', 'Room A'));
    await flush();
    const roomA = lastRoom();

    await useLiveKitStore.getState().disconnectFromRoom();
    await expect(useLiveKitStore.getState().connectToRoom(channel('b', 'Room B'))).resolves.toEqual({ ok: true });
    const roomB = lastRoom();

    roomA.resolveConnect();
    await expect(first).resolves.toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(roomA.disconnect).toHaveBeenCalled();
    expect(useLiveKitStore.getState()).toMatchObject({ currentRoom: roomB, currentRoomInfo: { Id: 'b' }, isConnected: true });
  });

  it('discards a connect that completes after the user disconnected', async () => {
    FakeRoom.nextConnect = ['hold'];
    const pending = useLiveKitStore.getState().connectToRoom(channel('a', 'Room A'));
    await flush();
    await useLiveKitStore.getState().disconnectFromRoom();
    expect(useLiveKitStore.getState().isConnecting).toBe(false);

    lastRoom().resolveConnect();
    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(lastRoom().disconnect).toHaveBeenCalled();
    expect(useLiveKitStore.getState()).toMatchObject({ isConnected: false, currentRoom: null });
    expect(RNCallKeep.startCall).not.toHaveBeenCalled();
  });

  it('ignores speaker and disconnect events from a room that was switched away from', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('a', 'Room A'));
    const roomA = lastRoom();
    await useLiveKitStore.getState().connectToRoom(channel('b', 'Room B'));
    const roomB = lastRoom();

    roomA.emit(RoomEvent.ActiveSpeakersChanged, [{ sid: roomA.localParticipant.sid, identity: 'local' }]);
    roomA.emit(RoomEvent.Disconnected);

    expect(useLiveKitStore.getState()).toMatchObject({ currentRoom: roomB, isConnected: true, isTalking: false, lastError: null });
  });
});

describe('drops and reconnect', () => {
  // Automatic rejoin: LiveKit retries a dropped room for about 45 s, then gives up. The member never left the channel,
  // so the store rejoins it — keeping what keeps the app alive in the background (CallKit call, FGS, headset monitoring).
  describe('automatic rejoin', () => {
    let connectivity: TestConnectivity;

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      connectivity = createTestConnectivity(true);
      configureVoice({ getApiContext: () => ctx, foregroundService, connectivity });
      mockGetSettings.mockResolvedValue(voiceSettings('fresh'));
    });

    afterEach(() => jest.useRealTimers());

    const dropAndAdvance = async (room: FakeRoom, ms: number, reason?: DisconnectReason): Promise<void> => {
      room.emit(RoomEvent.Disconnected, reason);
      await flush();
      await jest.advanceTimersByTimeAsync(ms);
      await flush(10);
    };

    it('keeps the background session through a drop and rejoins the channel with a fresh token, muted', async () => {
      await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
      const dropped = lastRoom();
      const uuid = getCallKeepService().getCurrentCallUUID();
      jest.mocked(RNCallKeep.startCall).mockClear();
      jest.mocked(RNCallKeep.endCall).mockClear();
      foregroundService.start.mockClear();

      dropped.emit(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE);
      await flush();

      expect(useLiveKitStore.getState()).toMatchObject({ isConnected: false, isReconnecting: true, currentRoom: null, currentRoomInfo: { Id: '1' }, lastError: null });
      expect(RNCallKeep.endCall).not.toHaveBeenCalled();
      expect(foregroundService.stop).not.toHaveBeenCalled();
      expect(getHeadsetButtonService().isMonitoringActive()).toBe(true);

      await jest.advanceTimersByTimeAsync(1_000);
      await flush(10);

      const rejoined = lastRoom();
      expect(rejoined).not.toBe(dropped);
      expect(mockGetSettings).toHaveBeenCalledWith(ctx, { forceRefresh: true });
      expect(rejoined.connect).toHaveBeenCalledWith('wss://voice.example.com', 'fresh');
      expect(useLiveKitStore.getState()).toMatchObject({ isConnected: true, isReconnecting: false, currentRoom: rejoined, isMicrophoneEnabled: false });
      // Under the same call and service: no second system call, no second foreground start.
      expect(RNCallKeep.startCall).not.toHaveBeenCalled();
      expect(getCallKeepService().getCurrentCallUUID()).toBe(uuid);
      expect(RNCallKeep.setMutedCall).toHaveBeenLastCalledWith(uuid, true);
      expect(foregroundService.start).not.toHaveBeenCalled();
    });

    it('keeps retrying with backoff while the server cannot be reached', async () => {
      await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
      FakeRoom.nextConnect = [new Error('ws closed'), new Error('ws closed')];

      await dropAndAdvance(lastRoom(), 1_000);
      expect(FakeRoom.instances).toHaveLength(2);
      expect(useLiveKitStore.getState()).toMatchObject({ isConnected: false, isReconnecting: true, lastError: null });

      await jest.advanceTimersByTimeAsync(2_000);
      await flush(10);
      expect(FakeRoom.instances).toHaveLength(3);

      await jest.advanceTimersByTimeAsync(4_000);
      await flush(10);
      expect(FakeRoom.instances).toHaveLength(4);
      expect(useLiveKitStore.getState()).toMatchObject({ isConnected: true, isReconnecting: false });
    });

    it('waits for the network while offline, then rejoins as soon as it is back', async () => {
      await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
      connectivity.setOnline(false);

      await dropAndAdvance(lastRoom(), 60_000);
      expect(FakeRoom.instances).toHaveLength(1);
      expect(useLiveKitStore.getState().isReconnecting).toBe(true);

      connectivity.setOnline(true);
      await flush(10);
      expect(FakeRoom.instances).toHaveLength(2);
      expect(useLiveKitStore.getState()).toMatchObject({ isConnected: true, isReconnecting: false });
    });

    it('tries again at once when the device moves to another network during the backoff', async () => {
      await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
      FakeRoom.nextConnect = [new Error('ws closed')];
      await dropAndAdvance(lastRoom(), 1_000);
      expect(FakeRoom.instances).toHaveLength(2);

      connectivity.changeNetwork();
      await flush(10);
      expect(FakeRoom.instances).toHaveLength(3);
      expect(useLiveKitStore.getState().isConnected).toBe(true);
    });

    it('leaves the channel for good when the server removed the member, or the same identity joined elsewhere', async () => {
      for (const reason of [DisconnectReason.PARTICIPANT_REMOVED, DisconnectReason.DUPLICATE_IDENTITY]) {
        await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
        foregroundService.stop.mockClear();

        await dropAndAdvance(lastRoom(), 60_000, reason);

        expect(useLiveKitStore.getState()).toMatchObject({ isConnected: false, isReconnecting: false, currentRoom: null, lastError: { code: 'disconnected', roomName: 'Fireground' }, lastRoomInfo: { Id: '1' } });
        expect(RNCallKeep.endCall).toHaveBeenCalled();
        expect(foregroundService.stop).toHaveBeenCalled();
        expect(getHeadsetButtonService().isMonitoringActive()).toBe(false);
        useLiveKitStore.setState({ lastError: null });
      }

      expect(FakeRoom.instances).toHaveLength(2);
    });

    it('gives up after the last attempt and ends the background session', async () => {
      await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
      FakeRoom.nextConnect = Array.from({ length: MAX_REJOIN_ATTEMPTS + 1 }, () => new Error('ws closed'));
      lastRoom().emit(RoomEvent.Disconnected);
      await flush();

      for (let attempt = 0; attempt <= MAX_REJOIN_ATTEMPTS; attempt++) {
        await jest.advanceTimersByTimeAsync(30_000);
        await flush(10);
      }

      expect(FakeRoom.instances).toHaveLength(MAX_REJOIN_ATTEMPTS + 1);
      expect(useLiveKitStore.getState()).toMatchObject({ isConnected: false, isReconnecting: false, lastError: { code: 'disconnected', roomName: 'Fireground' } });
      expect(RNCallKeep.endCall).toHaveBeenCalled();
      expect(foregroundService.stop).toHaveBeenCalled();
    });

    it('stops rejoining and ends the call when the member disconnects, or ends the system call, while it waits', async () => {
      await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
      lastRoom().emit(RoomEvent.Disconnected);
      await flush();

      await useLiveKitStore.getState().disconnectFromRoom();
      expect(useLiveKitStore.getState()).toMatchObject({ isConnected: false, isReconnecting: false, currentRoomInfo: null });
      expect(RNCallKeep.endCall).toHaveBeenCalled();
      expect(foregroundService.stop).toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(60_000);
      await flush(10);
      expect(FakeRoom.instances).toHaveLength(1);

      await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
      lastRoom().emit(RoomEvent.Disconnected);
      await flush();
      useBluetoothAudioStore.getState().setMediaButtonPTTSettings({ enabled: false });
      emitCallKeepEvent('endCall', { callUUID: getCallKeepService().getCurrentCallUUID() });
      await jest.advanceTimersByTimeAsync(SYSTEM_CALL_END_SETTLE_MS);
      await flush(10);
      await jest.advanceTimersByTimeAsync(60_000);
      await flush(10);
      expect(FakeRoom.instances).toHaveLength(2);
      expect(useLiveKitStore.getState().isReconnecting).toBe(false);
    });
  });

  it('tracks LiveKit reconnecting/reconnected and re-syncs the microphone state', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    const room = lastRoom();

    room.emit(RoomEvent.Reconnecting);
    expect(useLiveKitStore.getState().isReconnecting).toBe(true);

    room.localParticipant.isMicrophoneEnabled = true;
    inCallAudio.setAudioRoute.mockClear();
    room.emit(RoomEvent.Reconnected);
    await flush();
    expect(useLiveKitStore.getState()).toMatchObject({ isReconnecting: false, isMicrophoneEnabled: true });
    expect(inCallAudio.setAudioRoute).toHaveBeenCalled();
  });

  it('reconnect() rejoins the last channel with a refreshed token', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    lastRoom().emit(RoomEvent.Disconnected, DisconnectReason.ROOM_CLOSED);
    await flush();
    mockGetSettings.mockResolvedValue(voiceSettings('fresh'));

    await expect(useLiveKitStore.getState().reconnect()).resolves.toEqual({ ok: true });

    expect(mockGetSettings).toHaveBeenCalledWith(ctx, { forceRefresh: true });
    expect(lastRoom().connect).toHaveBeenCalledWith('wss://voice.example.com', 'fresh');
    expect(useLiveKitStore.getState().isConnected).toBe(true);
  });
});

describe('Android audio routing', () => {
  it('routes to the connected Bluetooth handset through InCallAudioModule and re-routes when it goes away mid-call', async () => {
    useBluetoothAudioStore.getState().setConnectedDevice({ id: 'ptt', name: 'AINA', isConnected: true, hasAudioCapability: true, supportsMicrophoneControl: true, device: { id: 'ptt' }, type: 'specialized' });
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    expect(inCallAudio.setAudioRoute).toHaveBeenLastCalledWith('bluetooth');
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: true, shouldRouteThroughEarpiece: true }));

    useBluetoothAudioStore.getState().setConnectedDevice(null);
    useBluetoothAudioStore.getState().setSelectedSpeaker({ id: 'default-speaker', name: 'Speaker', type: 'speaker', isAvailable: true });
    await flush();
    expect(inCallAudio.setAudioRoute).toHaveBeenLastCalledWith('speaker');
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ shouldRouteThroughEarpiece: false }));
  });

  it('uses the earpiece when no speaker is selected', async () => {
    useBluetoothAudioStore.getState().setSelectedSpeaker(null);
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    expect(inCallAudio.setAudioRoute).toHaveBeenLastCalledWith('earpiece');
  });
});

describe('CallKeep mute sync', () => {
  it('applies a CallKit/AirPods mute action to LiveKit without echoing it back', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    const room = lastRoom();
    const uuid = getCallKeepService().getCurrentCallUUID();
    useLiveKitStore.setState({ lastLocalMuteChangeTimestamp: 0 });
    RNCallKeep.setMutedCall.mockClear();

    emitCallKeepEvent('didPerformSetMutedCallAction', { muted: false, callUUID: uuid });
    await flush();

    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    expect(useLiveKitStore.getState().isMicrophoneEnabled).toBe(true);
    expect(RNCallKeep.setMutedCall).not.toHaveBeenCalled();
  });

  it('drops CallKit mute echoes right after a local change (oscillation guard)', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    const uuid = getCallKeepService().getCurrentCallUUID();
    await useLiveKitStore.getState().startTransmitting();

    emitCallKeepEvent('didPerformSetMutedCallAction', { muted: true, callUUID: uuid });
    await flush();

    expect(useLiveKitStore.getState().isMicrophoneEnabled).toBe(true);
  });

  it('leaves the channel when the call is ended from the system with headset PTT turned off', async () => {
    useBluetoothAudioStore.getState().setMediaButtonPTTSettings({ enabled: false });
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    const room = lastRoom();
    emitCallKeepEvent('endCall', { callUUID: getCallKeepService().getCurrentCallUUID() });
    await flush(10);
    expect(room.disconnect).toHaveBeenCalled();
    expect(useLiveKitStore.getState().isConnected).toBe(false);
  });
});

// During a call, iOS (CallKit) and Android (Telecom) turn the call button of wired and Bluetooth earbuds (and an AirPods
// double press) into "hang up". With headset PTT on, that is a press to talk: the channel stays and the call comes back.
describe('earbud call button', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }));

  afterEach(() => jest.useRealTimers());

  const pressCallButton = async (): Promise<void> => {
    emitCallKeepEvent('endCall', { callUUID: getCallKeepService().getCurrentCallUUID() });
    await flush();
    await jest.advanceTimersByTimeAsync(SYSTEM_CALL_END_SETTLE_MS);
    await flush(10);
  };

  it('toggles talk with each press, keeping the channel and starting the system call again', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    const room = lastRoom();
    jest.mocked(RNCallKeep.startCall).mockClear();

    await pressCallButton();
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(RNCallKeep.startCall).toHaveBeenCalledTimes(1);
    expect(useLiveKitStore.getState()).toMatchObject({ isConnected: true, currentRoom: room, isMicrophoneEnabled: true });
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    expect(inCallAudio.playSound).toHaveBeenLastCalledWith('startTransmitting');
    expect(RNCallKeep.setMutedCall).toHaveBeenLastCalledWith(getCallKeepService().getCurrentCallUUID(), false);

    await pressCallButton();
    expect(useLiveKitStore.getState()).toMatchObject({ isConnected: true, isMicrophoneEnabled: false });
    expect(inCallAudio.playSound).toHaveBeenLastCalledWith('stopTransmitting');
    expect(RNCallKeep.startCall).toHaveBeenCalledTimes(2);
    expect(RNCallKeep.setMutedCall).toHaveBeenLastCalledWith(getCallKeepService().getCurrentCallUUID(), true);
  });

  it('leaves the channel, never opening the microphone, when a phone call (cellular or emergency) took over', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    const room = lastRoom();
    jest.mocked(RNCallKeep.startCall).mockClear();
    inCallAudio.isInPhoneCall.mockResolvedValueOnce(true);

    await pressCallButton();
    expect(room.disconnect).toHaveBeenCalled();
    expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalledWith(true);
    expect(RNCallKeep.startCall).not.toHaveBeenCalled();
    expect(useLiveKitStore.getState().isConnected).toBe(false);
  });

  it('closes the microphone at once when pressed while talking, before anything else', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    await useLiveKitStore.getState().startTransmitting();
    const room = lastRoom();

    emitCallKeepEvent('endCall', { callUUID: getCallKeepService().getCurrentCallUUID() });
    await flush();
    expect(useLiveKitStore.getState().isMicrophoneEnabled).toBe(false);
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    await jest.advanceTimersByTimeAsync(SYSTEM_CALL_END_SETTLE_MS);
    await flush(10);
    expect(useLiveKitStore.getState()).toMatchObject({ isConnected: true, isMicrophoneEnabled: false });
  });

  it('leaves the channel when the system call cannot be started again', async () => {
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    jest.mocked(RNCallKeep.startCall).mockImplementationOnce(() => {
      throw new Error('CallKit refused the call');
    });

    await pressCallButton();
    expect(useLiveKitStore.getState()).toMatchObject({ isConnected: false, isMicrophoneEnabled: false });
  });

  it('brings the call back while a dropped channel is rejoined, and keeps rejoining', async () => {
    mockGetSettings.mockResolvedValue(voiceSettings('fresh'));
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
    FakeRoom.nextConnect = [new Error('ws closed')];
    lastRoom().emit(RoomEvent.Disconnected);
    await flush();
    await jest.advanceTimersByTimeAsync(1_000);
    await flush(10);
    jest.mocked(RNCallKeep.startCall).mockClear();

    await pressCallButton();
    expect(RNCallKeep.startCall).toHaveBeenCalledTimes(1);
    expect(useLiveKitStore.getState()).toMatchObject({ isReconnecting: true, currentRoomInfo: { Id: '1' } });

    await jest.advanceTimersByTimeAsync(2_000);
    await flush(10);
    expect(useLiveKitStore.getState()).toMatchObject({ isConnected: true, isReconnecting: false, isMicrophoneEnabled: false });
    // Rejoined under the call the press brought back.
    expect(RNCallKeep.startCall).toHaveBeenCalledTimes(1);
  });
});

describe('capability gating', () => {
  it('refuses to connect in BigBoard (no PTT)', async () => {
    activateVariant('bigboard');
    expect(await useLiveKitStore.getState().connectToRoom(channel('1', 'A'))).toMatchObject({ ok: false, error: { code: 'voice_disabled' } });
    expect(FakeRoom.instances).toHaveLength(0);
  });

  // Background voice is the same in every app with PTT (it was missing from Dispatch and IC's headset buttons).
  it.each(['dispatch', 'ic', 'responder'] as const)('%s keeps the channel alive with CallKeep and listens to headset buttons', async (variant) => {
    activateVariant(variant);
    resetCallKeepServiceForTests();
    await getCallKeepService().setup({
      appName: 'Resgrid',
      android: { alertTitle: 't', alertDescription: 'd', cancelButton: 'c', okButton: 'o', foregroundService: { channelId: 'voice_call', channelName: 'Call', notificationTitle: 'n' } },
    });
    jest.mocked(RNCallKeep.startCall).mockClear();
    await useLiveKitStore.getState().connectToRoom(channel('1', 'Console'));
    expect(useLiveKitStore.getState().isConnected).toBe(true);
    expect(RNCallKeep.startCall).toHaveBeenCalled();
    expect(foregroundService.start).toHaveBeenCalled();
    expect(getHeadsetButtonService().isMonitoringActive()).toBe(true);
    expect(DeviceEventEmitter.listenerCount('onMediaButtonEvent')).toBe(1);
  });
});

describe('voice settings', () => {
  it('loads channels and selects the default channel', async () => {
    mockGetSettings.mockResolvedValue({
      Data: { VoiceEnabled: true, VoipServerWebsocketSslAddress: 'wss://v', CallerIdName: 'Unit 1', CanConnectApiToken: 'cc', Channels: [channel('1', 'A'), channel('2', 'B', { IsDefault: true })] },
    });
    await expect(useLiveKitStore.getState().fetchVoiceSettings()).resolves.toEqual({ ok: true });
    expect(useLiveKitStore.getState()).toMatchObject({ isVoiceEnabled: true, voipServerWebsocketSslAddress: 'wss://v', selectedRoomId: '2', settingsLoaded: true });
    expect(useLiveKitStore.getState().availableRooms).toHaveLength(2);
  });

  it('exposes no channels when the department has voice disabled', async () => {
    mockGetSettings.mockResolvedValue({ Data: { VoiceEnabled: false, Channels: [channel('1', 'A')] } });
    await useLiveKitStore.getState().fetchVoiceSettings();
    expect(useLiveKitStore.getState()).toMatchObject({ isVoiceEnabled: false, availableRooms: [], selectedRoomId: null });
  });

  it('returns not_configured before the app injects an API context, and settings_failed on errors', async () => {
    resetVoiceRuntimeForTests();
    expect(await useLiveKitStore.getState().fetchVoiceSettings()).toMatchObject({ ok: false, error: { code: 'not_configured' } });
    configureVoice({ getApiContext: () => ctx });
    mockGetSettings.mockRejectedValue(new Error('offline'));
    expect(await useLiveKitStore.getState().fetchVoiceSettings()).toMatchObject({ ok: false, error: { code: 'settings_failed' } });
    expect(useLiveKitStore.getState().settingsError).toMatchObject({ code: 'settings_failed' });
  });
});

describe('platforms', () => {
  it('on iOS waits for CallKit to register the call and never routes through InCallAudioModule', async () => {
    Platform.OS = 'ios';
    resetCallKeepServiceForTests();
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });

    try {
      await getCallKeepService().setup({
        appName: 'Resgrid Unit',
        android: { alertTitle: 't', alertDescription: 'd', cancelButton: 'c', okButton: 'o', foregroundService: { channelId: 'call', channelName: 'Call', notificationTitle: 'n' } },
      });
      const pending = useLiveKitStore.getState().connectToRoom(channel('1', 'Fireground'));
      await flush(20);
      expect(RNCallKeep.reportConnectingOutgoingCallWithUUID).toHaveBeenCalled();
      jest.advanceTimersByTime(800);
      await expect(pending).resolves.toEqual({ ok: true });
      expect(RNCallKeep.reportConnectedOutgoingCallWithUUID).toHaveBeenCalled();
      expect(inCallAudio.setAudioRoute).not.toHaveBeenCalled();
      expect(foregroundService.start).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
