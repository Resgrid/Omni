// Ported from Unit services/__tests__/bluetooth-audio.service, -aina, -button-controls, -forget tests.
import { DeviceEventEmitter, NativeModules, resetReactNativeFake } from '../../__tests__/fakes/react-native';
import BleManager, { emitBleEvent, resetBleFake } from '../../__tests__/fakes/react-native-ble-manager';
import { createTestMicrophoneController, createTestStorage, type TestMicrophoneController } from '../../__tests__/helpers/test-doubles';
import { activateVariant } from '../../__tests__/helpers/variant';
import { getCallKeepService, resetCallKeepServiceForTests } from '../../callkeep/callkeep-service';
import { getHeadsetButtonService, resetHeadsetButtonServiceForTests } from '../../headset/headset-button-service';
import { registerMicrophoneController } from '../../ptt/microphone-controller';
import { configureVoice, PREFERRED_BLUETOOTH_DEVICE_KEY, resetVoiceRuntimeForTests } from '../../runtime';
import { useBluetoothAudioStore } from '../bluetooth-audio-store';
import { getBluetoothAudioService, resetBluetoothAudioServiceForTests } from '../bluetooth-service';
import { NativeBluetoothAudioService } from '../bluetooth-service-native';
import { AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP, B01INRICO_HEADSET_SERVICE, B01INRICO_HEADSET_SERVICE_CHAR, HYS_HEADSET_SERVICE, HYS_HEADSET_SERVICE_CHAR } from '../device-profiles';

const ainaDevice = { id: 'aina-1', name: 'AINA PTT', rssi: -50, advertising: { isConnectable: true, serviceUUIDs: [AINA_HEADSET_SERVICE, '111E'] } };
const AINA_COUNTER = '127FC0FF-CB21-11E5-93D0-0002A5D5C51B';

const makeController = createTestMicrophoneController;
const storage = createTestStorage;

let controller: TestMicrophoneController;
let service: NativeBluetoothAudioService;

const flush = async (times = 5) => {
  for (let i = 0; i < times; i++) await Promise.resolve();
};

const connectAina = async (extraCharacteristics: { service: string; characteristic: string; properties: unknown }[] = []) => {
  BleManager.getConnectedPeripherals.mockResolvedValue([ainaDevice]);
  BleManager.retrieveServices.mockResolvedValue({
    ...ainaDevice,
    characteristics: [{ service: AINA_HEADSET_SERVICE, characteristic: AINA_HEADSET_SVC_PROP, properties: { Notify: 'Notify', Read: 'Read' } }, ...extraCharacteristics],
  });
  const pending = service.connectToDevice(ainaDevice.id);
  await jest.advanceTimersByTimeAsync(500);
  await pending;
};

const notify = (serviceUuid: string, characteristic: string, value: number[]) => emitBleEvent('value', { peripheral: ainaDevice.id, service: serviceUuid, characteristic, value });

beforeEach(async () => {
  jest.useFakeTimers();
  resetReactNativeFake();
  resetBleFake();
  resetCallKeepServiceForTests();
  resetHeadsetButtonServiceForTests();
  resetBluetoothAudioServiceForTests();
  resetVoiceRuntimeForTests();
  activateVariant('unit');
  useBluetoothAudioStore.getState().reset();
  controller = makeController();
  registerMicrophoneController(controller);
  NativeModules.MediaButtonModule = { startListening: jest.fn(), stopListening: jest.fn() };
  service = new NativeBluetoothAudioService();
  await service.initialize();
});

afterEach(async () => {
  await service.destroy();
  registerMicrophoneController(null);
  jest.useRealTimers();
});

describe('connecting a handset', () => {
  it('subscribes the vendor characteristic, routes audio to the handset and arms the media-button fallback', async () => {
    await connectAina();

    expect(BleManager.startNotification).toHaveBeenCalledWith(ainaDevice.id, AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP);
    const state = useBluetoothAudioStore.getState();
    expect(state.connectedDevice).toMatchObject({ id: ainaDevice.id, type: 'specialized', supportsMicrophoneControl: true });
    expect(state.isHeadsetButtonMonitoring).toBe(true);
    expect(state.selectedAudioDevices.speaker).toMatchObject({ id: ainaDevice.id, type: 'bluetooth' });
    expect(state.selectedAudioDevices.microphone).toMatchObject({ id: ainaDevice.id, type: 'bluetooth' });
    expect(getHeadsetButtonService().isMonitoringActive()).toBe(true);
    expect(DeviceEventEmitter.listenerCount('onMediaButtonEvent')).toBe(1);
  });

  it('closes the CallKeep mute gate for a specialized handset and reopens it on disconnect', async () => {
    const callKeep = getCallKeepService();
    const remove = jest.spyOn(callKeep, 'removeMuteListener');
    const restore = jest.spyOn(callKeep, 'restoreMuteListener');
    await connectAina();
    expect(remove).toHaveBeenCalled();
    emitBleEvent('disconnect', { peripheral: ainaDevice.id });
    expect(restore).toHaveBeenCalled();
    expect(useBluetoothAudioStore.getState().connectedDevice).toBeNull();
    expect(useBluetoothAudioStore.getState().selectedAudioDevices.speaker?.id).toBe('default-speaker');
  });

  it('records a connection error and rethrows when the device never connects', async () => {
    BleManager.connect.mockImplementationOnce(() => new Promise(() => undefined));
    const pending = service.connectToDevice('ghost');
    const assertion = expect(pending).rejects.toThrow('Timed out connecting');
    await jest.advanceTimersByTimeAsync(16000);
    await assertion;
    expect(useBluetoothAudioStore.getState().connectionError).toContain('Timed out');
    expect(BleManager.disconnect).toHaveBeenCalledWith('ghost');
  });
});

describe('PTT buttons', () => {
  it('transmits on Aina PTT press and releases on PTT release', async () => {
    await connectAina();
    notify(AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP, [0x01]);
    await flush();
    expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(true, 'bluetooth');
    notify(AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP, [0x00]);
    await flush();
    expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, 'bluetooth');
    expect(controller.setMicrophoneEnabled).toHaveBeenCalledTimes(2);
  });

  it('de-duplicates repeated press frames and toggles on the mute button', async () => {
    await connectAina();
    notify(AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP, [0x01]);
    notify(AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP, [0x01]);
    await flush();
    expect(controller.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    notify(AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP, [0x02]);
    await flush();
    expect(controller.toggleMicrophone).toHaveBeenCalledWith('bluetooth');
  });

  it('ignores the Aina counter characteristic so it cannot toggle mute while PTT is held', async () => {
    await connectAina([{ service: AINA_HEADSET_SERVICE, characteristic: AINA_COUNTER, properties: { Notify: 'Notify' } }]);
    notify(AINA_HEADSET_SERVICE, AINA_COUNTER, [0x04]);
    await flush();
    expect(controller.toggleMicrophone).not.toHaveBeenCalled();
    expect(controller.setMicrophoneEnabled).not.toHaveBeenCalled();
  });

  it('parses B01 Inrico and HYS frames from their characteristics', async () => {
    await connectAina();
    notify(B01INRICO_HEADSET_SERVICE, B01INRICO_HEADSET_SERVICE_CHAR, [0x2b, 0, 0, 0, 0, 0x50]);
    await flush();
    expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(true, 'bluetooth');
    notify(HYS_HEADSET_SERVICE, HYS_HEADSET_SERVICE_CHAR, [0x00]);
    await flush();
    expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, 'bluetooth');
  });

  it('ignores battery level notifications (battery 100% decoded as mute)', async () => {
    await connectAina();
    notify('180F', '2A19', [0x64]);
    await flush();
    expect(controller.toggleMicrophone).not.toHaveBeenCalled();
  });

  it('retries a press that arrives while the channel is still connecting', async () => {
    await connectAina();
    controller.active = false;
    controller.connecting = true;
    notify(AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP, [0x01]);
    await flush();
    expect(controller.setMicrophoneEnabled).not.toHaveBeenCalled();
    controller.active = true;
    controller.connecting = false;
    await jest.advanceTimersByTimeAsync(200);
    expect(controller.setMicrophoneEnabled).toHaveBeenCalledWith(true, 'bluetooth');
  });

  it('locks CallKeep mute actions around a hardware PTT press', async () => {
    const ignore = jest.spyOn(getCallKeepService(), 'ignoreMuteEvents');
    await connectAina();
    notify(AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP, [0x01]);
    expect(ignore).toHaveBeenCalledWith(1000);
  });

  it('releases a held press when the handset disconnects, so the mic is never left open', async () => {
    await connectAina();
    notify(AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP, [0x01]);
    await flush();
    await service.disconnectDevice();
    await flush();
    expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, 'bluetooth');
    expect(getHeadsetButtonService().isMonitoringActive()).toBe(false);
  });
});

describe('read-polling fallback', () => {
  it('reports changed values from polled reads and stops polling once a notification arrives', async () => {
    await connectAina();
    BleManager.read.mockResolvedValueOnce([0x00]).mockResolvedValueOnce([0x01]);
    await service.pollReads(ainaDevice.id); // baseline
    await service.pollReads(ainaDevice.id);
    expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(true, 'bluetooth');

    notify(AINA_HEADSET_SERVICE, AINA_HEADSET_SVC_PROP, [0x00]);
    BleManager.read.mockClear();
    await service.pollReads(ainaDevice.id);
    expect(BleManager.read).not.toHaveBeenCalled();
  });

  it('stops polling a characteristic after repeated read failures', async () => {
    await connectAina();
    BleManager.read.mockRejectedValue(new Error('Reading is not permitted'));
    for (let i = 0; i < 3; i++) await service.pollReads(ainaDevice.id);
    BleManager.read.mockClear();
    await service.pollReads(ainaDevice.id);
    expect(BleManager.read).not.toHaveBeenCalled();
  });
});

describe('discovery and preferred device', () => {
  it('lists strong audio devices and auto-connects the preferred one', async () => {
    const kv = storage();
    kv.values.set(PREFERRED_BLUETOOTH_DEVICE_KEY, { id: ainaDevice.id, name: 'AINA PTT' });
    configureVoice({ getApiContext: () => null, storage: kv });
    BleManager.connect.mockRejectedValueOnce(new Error('not in range'));
    const fresh = new NativeBluetoothAudioService();
    const init = fresh.initialize();
    await jest.advanceTimersByTimeAsync(600);
    await init;
    expect(BleManager.scan).toHaveBeenCalled();

    BleManager.getConnectedPeripherals.mockResolvedValue([ainaDevice]);
    BleManager.retrieveServices.mockResolvedValue({ ...ainaDevice, characteristics: [] });
    emitBleEvent('discover', { id: 'weak', name: 'Headset', rssi: -99, advertising: { isConnectable: true } });
    emitBleEvent('discover', ainaDevice);
    await jest.advanceTimersByTimeAsync(600);
    expect(useBluetoothAudioStore.getState().availableDevices.map((d) => d.id)).toEqual([ainaDevice.id]);
    expect(useBluetoothAudioStore.getState().connectedDevice?.id).toBe(ainaDevice.id);
    await fresh.destroy();
  });

  it('persists the preferred device under its legacy key and forgets it', async () => {
    const kv = storage();
    configureVoice({ getApiContext: () => null, storage: kv });
    service.setPreferredDevice({ id: 'x', name: 'X' });
    expect(kv.setJSON).toHaveBeenCalledWith('preferredBluetoothDevice', { id: 'x', name: 'X' });
    await service.forgetPreferredDevice('x');
    expect(kv.delete).toHaveBeenCalledWith('preferredBluetoothDevice');
    expect(useBluetoothAudioStore.getState().preferredDevice).toBeNull();
  });

  it('switches to system audio and remembers that choice', async () => {
    const kv = storage();
    configureVoice({ getApiContext: () => null, storage: kv });
    await connectAina();
    await service.connectToSystemAudio();
    expect(useBluetoothAudioStore.getState().connectedDevice).toBeNull();
    expect(kv.values.get(PREFERRED_BLUETOOTH_DEVICE_KEY)).toEqual({ id: 'system-audio', name: 'System Audio' });
  });
});

describe('capability gating', () => {
  it('BigBoard gets no Bluetooth PTT service (the BLE module is never loaded)', () => {
    activateVariant('bigboard');
    expect(getBluetoothAudioService()).toBeNull();
  });

  it.each(['responder', 'unit', 'ic', 'dispatch'] as const)('%s gets the native BLE service on Android', (variant) => {
    activateVariant(variant);
    resetBluetoothAudioServiceForTests();
    expect(getBluetoothAudioService()).toBeInstanceOf(NativeBluetoothAudioService);
  });
});
