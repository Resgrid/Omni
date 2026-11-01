import { logger } from '@resgrid/core';

import { getCallKeepService } from '../callkeep/callkeep-service';
import { errorMessage, errorName } from '../util/async';
import { useBluetoothAudioStore } from './bluetooth-audio-store';
import { BluetoothAudioServiceBase } from './bluetooth-service-base';
import { BUTTON_CONTROL_CHARACTERISTICS, getDeviceType, isExcludedStandardCharacteristic, isLikelyButtonCharacteristic, normalizeUuid, VENDOR_BUTTON_CHARACTERISTICS } from './device-profiles';
import { type BlePeripheral, type BluetoothAudioDevice, BluetoothState, SYSTEM_AUDIO_DEVICE } from './types';

/** Minimal Web Bluetooth surface (not in TypeScript's DOM lib). */
interface GattCharacteristic {
  uuid: string;
  service?: { uuid: string };
  properties: { notify?: boolean; indicate?: boolean; read?: boolean };
  value?: DataView | null;
  startNotifications(): Promise<GattCharacteristic>;
  stopNotifications?(): Promise<GattCharacteristic>;
  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
}

interface GattService {
  uuid: string;
  getCharacteristic(uuid: string): Promise<GattCharacteristic>;
  getCharacteristics(): Promise<GattCharacteristic[]>;
}

interface GattServer {
  connected: boolean;
  connect(): Promise<GattServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<GattService>;
  getPrimaryServices(): Promise<GattService[]>;
}

export interface WebBluetoothDevice {
  id: string;
  name?: string;
  gatt?: GattServer;
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
  removeEventListener(type: 'gattserverdisconnected', listener: () => void): void;
}

export interface WebBluetooth {
  getAvailability(): Promise<boolean>;
  requestDevice(options: { filters?: object[]; acceptAllDevices?: boolean; optionalServices?: string[] }): Promise<WebBluetoothDevice>;
  getDevices?(): Promise<WebBluetoothDevice[]>;
}

const webUuid = (uuid: string): string => normalizeUuid(uuid).toLowerCase();

const VENDOR_SERVICES = VENDOR_BUTTON_CHARACTERISTICS.map((entry) => webUuid(entry.service));
/** GATT services a PTT handset may expose. Classic audio profiles (A2DP/HFP) are not GATT, so they are not filters. */
const OPTIONAL_SERVICES = [...VENDOR_SERVICES, webUuid('FE59'), webUuid('180F'), webUuid('1812')];
const NAME_PREFIXES = ['AINA', 'Aina', 'Inrico', 'INRICO', 'B01', 'HYS'];

const bluetooth = (): WebBluetooth | null => {
  if (typeof navigator === 'undefined' || navigator === null) return null;
  return (navigator as unknown as { bluetooth?: WebBluetooth }).bluetooth ?? null;
};

const toPeripheral = (device: WebBluetoothDevice): BlePeripheral => ({ id: device.id, name: device.name ?? null, advertising: { localName: device.name } });

const toAudioDevice = (device: WebBluetoothDevice, isConnected: boolean): BluetoothAudioDevice => {
  const peripheral = toPeripheral(device);
  const name = (device.name ?? '').toLowerCase();
  return {
    id: device.id,
    name: device.name ?? null,
    isConnected,
    hasAudioCapability: true,
    // Only known after connecting on web; headsets/hands-free names are the legacy heuristic.
    supportsMicrophoneControl: name.includes('headset') || name.includes('hands') || name.includes('hfp'),
    device: peripheral,
    type: getDeviceType(peripheral),
  };
};

const bytesOf = (view: DataView | null | undefined): Uint8Array => (view ? new Uint8Array(view.buffer, view.byteOffset, view.byteLength) : new Uint8Array(0));

/**
 * Bluetooth PTT on web and Electron through the Web Bluetooth API (Dispatch web.service, made real): the browser's
 * chooser picks a handset (user gesture), then the same vendor characteristics and parsers as native are subscribed
 * over GATT. Previously permitted devices reconnect at startup through `getDevices()` where the browser supports it.
 */
export class WebBluetoothAudioService extends BluetoothAudioServiceBase {
  readonly platform = 'web' as const;
  private devices = new Map<string, WebBluetoothDevice>();
  private connected: WebBluetoothDevice | null = null;
  private subscriptions: { characteristic: GattCharacteristic; listener: (event: Event) => void }[] = [];
  private isInitialized = false;

  isSupported(): boolean {
    return bluetooth() !== null;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized || !this.isSupported()) return;
    this.isInitialized = true;
    const state = await this.checkBluetoothState();
    useBluetoothAudioStore.getState().setBluetoothState(state);
    if (state !== BluetoothState.PoweredOn) return;
    const preferred = this.loadPreferredDevice();
    const api = bluetooth();
    if (!preferred || preferred.id === SYSTEM_AUDIO_DEVICE.id || !api?.getDevices) return;
    try {
      const known = await api.getDevices();
      const device = known.find((candidate) => candidate.id === preferred.id);
      if (!device) return;
      this.rememberDevice(device);
      await this.connectToDevice(device.id);
    } catch (error) {
      logger.info({ message: 'Preferred Web Bluetooth device not reconnected', context: { error } });
    }
  }

  async requestPermissions(): Promise<boolean> {
    // Granted per device through the chooser.
    return this.isSupported();
  }

  async checkBluetoothState(): Promise<BluetoothState> {
    const api = bluetooth();
    if (!api) return BluetoothState.Unsupported;
    try {
      return (await api.getAvailability()) ? BluetoothState.PoweredOn : BluetoothState.PoweredOff;
    } catch {
      return BluetoothState.Unknown;
    }
  }

  async startScanning(_durationMs?: number): Promise<void> {
    const api = bluetooth();
    if (!api) throw new Error('Web Bluetooth is not supported');
    const store = useBluetoothAudioStore.getState();
    store.setIsScanning(true);
    try {
      const device = await api.requestDevice({
        filters: [...VENDOR_SERVICES.map((service) => ({ services: [service] })), ...NAME_PREFIXES.map((namePrefix) => ({ namePrefix }))],
        optionalServices: OPTIONAL_SERVICES,
      });
      this.rememberDevice(device);
    } catch (error) {
      // The user closed the chooser without picking a device.
      if (errorName(error) !== 'NotFoundError') throw error;
    } finally {
      useBluetoothAudioStore.getState().setIsScanning(false);
    }
  }

  async stopScanning(): Promise<void> {
    useBluetoothAudioStore.getState().setIsScanning(false);
  }

  async connectToDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device?.gatt) throw new Error('Device not found in available devices');
    const store = useBluetoothAudioStore.getState();
    store.clearConnectionError();
    store.setIsConnecting(true);
    try {
      const server = await device.gatt.connect();
      device.addEventListener('gattserverdisconnected', this.onGattDisconnected);
      this.connected = device;
      await this.subscribeButtons(device, server);
      useBluetoothAudioStore.getState().setConnectedDevice(toAudioDevice(device, true));
      if (getDeviceType(toPeripheral(device)) === 'specialized') getCallKeepService().removeMuteListener();
      this.setupAudioRouting(toPeripheral(device));
      await this.playConnectedSound();
    } catch (error) {
      useBluetoothAudioStore.getState().setConnectionError(errorMessage(error));
      throw error;
    } finally {
      useBluetoothAudioStore.getState().setIsConnecting(false);
    }
  }

  async disconnectDevice(): Promise<void> {
    const device = this.connected;
    if (!device) return;
    try {
      if (device.gatt?.connected) device.gatt.disconnect();
    } catch (error) {
      logger.warn({ message: 'Web Bluetooth disconnect failed', context: { error } });
    }
    this.handleDisconnected(device.id);
  }

  async isDeviceConnected(deviceId: string): Promise<boolean> {
    return this.connected?.id === deviceId && Boolean(this.connected.gatt?.connected);
  }

  ensurePttInputMonitoring(_reason: string): void {
    // GATT notifications stay subscribed for the life of the connection; there is no media-button fallback on web.
  }

  async destroy(): Promise<void> {
    await this.disconnectDevice();
    this.devices.clear();
    this.isInitialized = false;
  }

  private rememberDevice(device: WebBluetoothDevice): void {
    this.devices.set(device.id, device);
    useBluetoothAudioStore.getState().addDevice(toAudioDevice(device, this.connected?.id === device.id));
  }

  private async subscribeButtons(device: WebBluetoothDevice, server: GattServer): Promise<void> {
    this.hasVendorButtonCharacteristic = false;
    const isSpecializedDevice = getDeviceType(toPeripheral(device)) === 'specialized';
    for (const vendor of VENDOR_BUTTON_CHARACTERISTICS) {
      try {
        const service = await server.getPrimaryService(webUuid(vendor.service));
        const characteristic = await service.getCharacteristic(webUuid(vendor.characteristic));
        await this.subscribe(characteristic, vendor.service, isSpecializedDevice);
        this.hasVendorButtonCharacteristic = true;
      } catch {
        // Not this family.
      }
    }
    if (!this.hasVendorButtonCharacteristic) {
      try {
        for (const service of await server.getPrimaryServices()) {
          for (const characteristic of await service.getCharacteristics()) {
            const likely = BUTTON_CONTROL_CHARACTERISTICS.some((uuid) => webUuid(uuid) === characteristic.uuid.toLowerCase()) || isLikelyButtonCharacteristic(service.uuid, characteristic.uuid);
            if (isExcludedStandardCharacteristic(characteristic.uuid) || !(characteristic.properties.notify || characteristic.properties.indicate) || !(likely || isSpecializedDevice)) continue;
            await this.subscribe(characteristic, service.uuid, isSpecializedDevice).catch(() => undefined);
          }
        }
      } catch (error) {
        logger.debug({ message: 'Web Bluetooth service discovery failed', context: { error } });
      }
    }
    useBluetoothAudioStore.getState().setIsHeadsetButtonMonitoring(this.subscriptions.length > 0);
  }

  private async subscribe(characteristic: GattCharacteristic, serviceUuid: string, isSpecializedDevice: boolean): Promise<void> {
    const listener = (event: Event): void => {
      const target = (event.target as unknown as GattCharacteristic | null) ?? characteristic;
      this.handleCharacteristicValue(serviceUuid, characteristic.uuid, bytesOf(target.value), { hasVendorButtonCharacteristic: this.hasVendorButtonCharacteristic, isSpecializedDevice });
    };
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', listener);
    this.subscriptions.push({ characteristic, listener });
  }

  private onGattDisconnected = (): void => {
    if (this.connected) this.handleDisconnected(this.connected.id);
  };

  private handleDisconnected(deviceId: string): void {
    if (!this.connected || this.connected.id !== deviceId) return;
    this.connected.removeEventListener('gattserverdisconnected', this.onGattDisconnected);
    this.subscriptions.forEach(({ characteristic, listener }) => characteristic.removeEventListener('characteristicvaluechanged', listener));
    this.subscriptions = [];
    this.connected = null;
    this.hasVendorButtonCharacteristic = false;
    const store = useBluetoothAudioStore.getState();
    store.setConnectedDevice(null);
    store.clearConnectionError();
    this.revertAudioRouting();
    getCallKeepService().restoreMuteListener();
  }
}
