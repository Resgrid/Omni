// Web Bluetooth path (Dispatch web.service, now with real GATT subscriptions) for web and Electron.
import { Platform, resetReactNativeFake } from '../../__tests__/fakes/react-native';
import { activateVariant } from '../../__tests__/helpers/variant';
import { resetCallKeepServiceForTests } from '../../callkeep/callkeep-service';
import { type MicrophoneController, registerMicrophoneController } from '../../ptt/microphone-controller';
import { useBluetoothAudioStore } from '../bluetooth-audio-store';
import { getBluetoothAudioService, resetBluetoothAudioServiceForTests } from '../bluetooth-service.web';
import { WebBluetoothAudioService } from '../bluetooth-service-web';
import { BluetoothState } from '../types';

type Listener = (event: { target: unknown }) => void;

interface TestCharacteristic {
  uuid: string;
  properties: { notify: boolean };
  value: DataView | null;
  startNotifications: jest.Mock<Promise<TestCharacteristic>, []>;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  push(bytes: number[]): void;
}

interface TestServer {
  connected: boolean;
  connect: jest.Mock<Promise<TestServer>, []>;
  disconnect: jest.Mock;
  getPrimaryService: jest.Mock;
  getPrimaryServices: jest.Mock;
}

const makeCharacteristic = (uuid: string): TestCharacteristic => {
  const listeners: Listener[] = [];
  const characteristic: TestCharacteristic = {
    uuid,
    properties: { notify: true },
    value: null as DataView | null,
    startNotifications: jest.fn(async () => characteristic),
    addEventListener: jest.fn((_type: string, listener: Listener) => listeners.push(listener)),
    removeEventListener: jest.fn(),
    push(bytes: number[]) {
      characteristic.value = new DataView(Uint8Array.from(bytes).buffer);
      listeners.forEach((listener) => listener({ target: characteristic }));
    },
  };
  return characteristic;
};

const makeDevice = (name: string, vendorService: string | null, vendorCharacteristic: string) => {
  const characteristic = makeCharacteristic(vendorCharacteristic);
  const disconnectListeners: (() => void)[] = [];
  const server: TestServer = {
    connected: false,
    connect: jest.fn(async () => {
      server.connected = true;
      return server;
    }),
    disconnect: jest.fn(() => {
      server.connected = false;
      disconnectListeners.forEach((listener) => listener());
    }),
    getPrimaryService: jest.fn(async (uuid: string) => {
      if (uuid !== vendorService) throw Object.assign(new Error('No service'), { name: 'NotFoundError' });
      return { uuid, getCharacteristic: jest.fn(async () => characteristic), getCharacteristics: jest.fn(async () => [characteristic]) };
    }),
    getPrimaryServices: jest.fn(async () => []),
  };
  return {
    id: `web-${name}`,
    name,
    gatt: server,
    characteristic,
    addEventListener: jest.fn((_type: string, listener: () => void) => disconnectListeners.push(listener)),
    removeEventListener: jest.fn(),
  };
};

const ainaService = '127face1-cb21-11e5-93d0-0002a5d5c51b';
const ainaCharacteristic = '127fbeef-cb21-11e5-93d0-0002a5d5c51b';

let bluetooth: { getAvailability: jest.Mock; requestDevice: jest.Mock; getDevices: jest.Mock };
let controller: MicrophoneController & { setMicrophoneEnabled: jest.Mock; toggleMicrophone: jest.Mock };

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  resetReactNativeFake();
  Platform.OS = 'web';
  resetCallKeepServiceForTests();
  resetBluetoothAudioServiceForTests();
  useBluetoothAudioStore.getState().reset();
  bluetooth = { getAvailability: jest.fn(async () => true), requestDevice: jest.fn(), getDevices: jest.fn(async () => []) };
  Object.defineProperty(globalThis, 'navigator', { value: { bluetooth }, configurable: true, writable: true });
  controller = {
    isActive: () => true,
    isConnecting: () => false,
    isMicrophoneEnabled: () => false,
    setMicrophoneEnabled: jest.fn(async () => undefined),
    toggleMicrophone: jest.fn(async () => undefined),
  };
  registerMicrophoneController(controller);
  activateVariant('dispatch');
});

afterEach(() => {
  registerMicrophoneController(null);
  Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true, writable: true });
});

it('is the Bluetooth PTT service on web for Dispatch when the browser exposes Web Bluetooth', () => {
  expect(getBluetoothAudioService()).toBeInstanceOf(WebBluetoothAudioService);
});

it('is unavailable without navigator.bluetooth or without the capability', () => {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  activateVariant('dispatch');
  expect(getBluetoothAudioService()).toBeNull();
  activateVariant('bigboard');
  expect(getBluetoothAudioService()).toBeNull();
});

it('asks the browser chooser for PTT handsets by vendor service and name', async () => {
  const device = makeDevice('AINA PTT', ainaService, ainaCharacteristic);
  bluetooth.requestDevice.mockResolvedValue(device);
  const service = new WebBluetoothAudioService();
  await service.startScanning();

  const options = bluetooth.requestDevice.mock.calls[0][0];
  expect(options.filters).toEqual(expect.arrayContaining([{ services: [ainaService] }, { namePrefix: 'Inrico' }, { namePrefix: 'HYS' }]));
  expect(options.optionalServices).toContain('0000ffe0-0000-1000-8000-00805f9b34fb');
  expect(useBluetoothAudioStore.getState().availableDevices).toEqual([expect.objectContaining({ id: device.id, type: 'specialized' })]);
  expect(useBluetoothAudioStore.getState().isScanning).toBe(false);
});

it('treats a cancelled chooser as no selection', async () => {
  bluetooth.requestDevice.mockRejectedValue(Object.assign(new Error('User cancelled'), { name: 'NotFoundError' }));
  await expect(new WebBluetoothAudioService().startScanning()).resolves.toBeUndefined();
});

it('connects over GATT, subscribes the vendor characteristic and drives PTT from notifications', async () => {
  const device = makeDevice('AINA PTT', ainaService, ainaCharacteristic);
  bluetooth.requestDevice.mockResolvedValue(device);
  const service = new WebBluetoothAudioService();
  await service.startScanning();
  await service.connectToDevice(device.id);

  expect(device.gatt.connect).toHaveBeenCalled();
  expect(device.characteristic.startNotifications).toHaveBeenCalled();
  expect(useBluetoothAudioStore.getState()).toMatchObject({ connectedDevice: { id: device.id, isConnected: true }, isHeadsetButtonMonitoring: true });

  device.characteristic.push([0x01]);
  await flush();
  expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(true, 'bluetooth');
  device.characteristic.push([0x00]);
  await flush();
  expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, 'bluetooth');
});

it('cleans up and releases PTT when the GATT server disconnects', async () => {
  const device = makeDevice('AINA PTT', ainaService, ainaCharacteristic);
  bluetooth.requestDevice.mockResolvedValue(device);
  const service = new WebBluetoothAudioService();
  await service.startScanning();
  await service.connectToDevice(device.id);
  device.characteristic.push([0x01]);
  await flush();

  device.gatt.disconnect();
  await flush();
  expect(useBluetoothAudioStore.getState().connectedDevice).toBeNull();
  expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, 'bluetooth');
});

it('reports availability and reconnects a previously permitted preferred device', async () => {
  const device = makeDevice('AINA PTT', ainaService, ainaCharacteristic);
  bluetooth.getDevices.mockResolvedValue([device]);
  useBluetoothAudioStore.getState().setPreferredDevice({ id: device.id, name: 'AINA PTT' });
  const service = new WebBluetoothAudioService();
  await service.initialize();
  expect(useBluetoothAudioStore.getState().bluetoothState).toBe(BluetoothState.PoweredOn);
  expect(useBluetoothAudioStore.getState().connectedDevice?.id).toBe(device.id);
});
