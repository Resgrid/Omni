import { logger } from '@resgrid/core';
import { PermissionsAndroid, Platform } from 'react-native';
import BleManager, { BleScanCallbackType, BleScanMatchMode, BleScanMode, type BleState, type Peripheral, type PeripheralInfo } from 'react-native-ble-manager';

import { getCallKeepService } from '../callkeep/callkeep-service';
import { getHeadsetButtonService } from '../headset/headset-button-service';
import { errorMessage } from '../util/async';
import { useBluetoothAudioStore } from './bluetooth-audio-store';
import { BluetoothAudioServiceBase } from './bluetooth-service-base';
import {
  areUuidsEqual,
  characteristicKey,
  getDeviceType,
  isAudioDevice,
  isExcludedStandardCharacteristic,
  isLikelyButtonCharacteristic,
  supportsMicrophoneControl,
  VENDOR_BUTTON_CHARACTERISTICS,
} from './device-profiles';
import { type BlePeripheral, type BluetoothAudioDevice, BluetoothState, SYSTEM_AUDIO_DEVICE } from './types';

/** Upper bound on one BleManager.connect (Android can hang forever). */
export const BLE_CONNECTION_TIMEOUT_MS = 15000;
const STRONG_RSSI_THRESHOLD = -95;
const READ_POLL_INTERVAL_MS = 700;
const READ_POLL_MAX_CONSECUTIVE_FAILURES = 3;
const WATCHDOG_INTERVAL_MS = 4000;
const WATCHDOG_RECOVERY_MS = 12000;

interface ReadPollEntry {
  service: string;
  characteristic: string;
  lastHex: string | null;
  notificationConfirmed: boolean;
  failures: number;
}

interface CharacteristicUpdate {
  value: number[];
  peripheral: string;
  service: string;
  characteristic: string;
}

const propertyNames = (properties: unknown): string[] => {
  if (Array.isArray(properties)) return properties.filter((p): p is string => typeof p === 'string').map((p) => p.toLowerCase());
  if (typeof properties === 'object' && properties !== null) return Object.keys(properties).map((p) => p.toLowerCase());
  return [];
};
const canRead = (properties: unknown): boolean => propertyNames(properties).includes('read');
const canNotifyOrRead = (properties: unknown): boolean => propertyNames(properties).some((p) => p === 'notify' || p === 'indicate' || p === 'read');

const mapBleState = (state: BleState | string): BluetoothState => {
  switch (state) {
    case 'on':
      return BluetoothState.PoweredOn;
    case 'off':
      return BluetoothState.PoweredOff;
    case 'turning_on':
    case 'turning_off':
    case 'resetting':
      return BluetoothState.Resetting;
    case 'unauthorized':
      return BluetoothState.Unauthorized;
    case 'unsupported':
      return BluetoothState.Unsupported;
    default:
      return BluetoothState.Unknown;
  }
};

const toAudioDevice = (device: BlePeripheral, isConnected: boolean): BluetoothAudioDevice => ({
  id: device.id,
  name: device.name ?? null,
  rssi: device.rssi || undefined,
  isConnected,
  hasAudioCapability: true,
  supportsMicrophoneControl: supportsMicrophoneControl(device),
  device,
  type: getDeviceType(device),
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * BLE PTT handsets on iOS/Android through react-native-ble-manager (Unit bluetooth-audio.service): discovery with
 * audio-device detection, preferred-device auto-connect, vendor button subscriptions (Aina, B01 Inrico, HYS) with
 * generic fallbacks, a read-polling fallback for handsets whose notifications never fire (screen-off PTT), a monitoring
 * watchdog, and the Android media-button fallback for handsets that report PTT as AVRCP keys.
 */
export class NativeBluetoothAudioService extends BluetoothAudioServiceBase {
  readonly platform = 'native' as const;
  private connectedDevice: BlePeripheral | null = null;
  private isConnecting = false;
  private isInitialized = false;
  private hasAttemptedPreferredDevice = false;
  private bleStarted = false;
  private bleStartPromise: Promise<void> | null = null;
  private listeners: { remove: () => void }[] = [];
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private readPolls: ReadPollEntry[] = [];
  private readPollTimer: ReturnType<typeof setInterval> | null = null;
  private readPollInFlight = false;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private monitoringStartedAt: number | null = null;
  private mediaFallbackActive = false;

  isSupported(): boolean {
    return Platform.OS === 'ios' || Platform.OS === 'android';
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      // Permissions first: a denial keeps initialize() retryable.
      if (!(await this.requestPermissions())) {
        logger.warn({ message: 'Bluetooth permissions not granted; Bluetooth PTT not initialized' });
        return;
      }
      await this.ensureBleStarted();
      this.isInitialized = true;
      const state = await this.checkBluetoothState();
      useBluetoothAudioStore.getState().setBluetoothState(state);
      if (state !== BluetoothState.PoweredOn) return;
      await this.attemptPreferredDeviceConnection();
    } catch (error) {
      logger.error({ message: 'Failed to initialize Bluetooth PTT', context: { error } });
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true; // iOS: Info.plist usage strings
    try {
      // Android 12+ scans with BLUETOOTH_SCAN/CONNECT; 11 and lower need location for BLE scans.
      const permissions = Number(Platform.Version) >= 31 ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      const granted = await Promise.all(permissions.map((permission) => PermissionsAndroid.check(permission)));
      if (granted.every(Boolean)) return true;
      // Android drops a request made while another prompt is showing; give startup prompts a moment.
      await sleep(500);
      const results = await PermissionsAndroid.requestMultiple(permissions);
      return Object.values(results).every((result) => result === PermissionsAndroid.RESULTS.GRANTED);
    } catch (error) {
      logger.error({ message: 'Failed to request Bluetooth permissions', context: { error } });
      return false;
    }
  }

  async checkBluetoothState(): Promise<BluetoothState> {
    try {
      return mapBleState(await BleManager.checkState());
    } catch (error) {
      logger.warn({ message: 'Failed to read Bluetooth state', context: { error } });
      return BluetoothState.Unknown;
    }
  }

  async startScanning(durationMs: number = 10000): Promise<void> {
    if (!(await this.requestPermissions())) throw new Error('Bluetooth permissions not granted');
    await this.ensureBleStarted();
    const state = await this.checkBluetoothState();
    if (state !== BluetoothState.PoweredOn) throw new Error(`Bluetooth is ${state}`);
    const store = useBluetoothAudioStore.getState();
    if (store.isScanning) return;
    store.setIsScanning(true);
    store.clearDevices();
    try {
      await BleManager.scan([], durationMs / 1000, false, { matchMode: BleScanMatchMode.Sticky, scanMode: BleScanMode.LowLatency, callbackType: BleScanCallbackType.AllMatches });
      this.scanTimeout = setTimeout(() => this.handleScanStopped(), durationMs);
    } catch (error) {
      useBluetoothAudioStore.getState().setIsScanning(false);
      throw error;
    }
  }

  async stopScanning(): Promise<void> {
    try {
      await BleManager.stopScan();
    } catch (error) {
      logger.debug({ message: 'stopScan failed', context: { error } });
    }
    this.handleScanStopped();
  }

  async connectToDevice(deviceId: string): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;
    const store = useBluetoothAudioStore.getState();
    try {
      store.clearConnectionError();
      store.setIsConnecting(true);
      await this.stopScanning();
      await sleep(500);
      await this.withConnectionTimeout(Promise.resolve(BleManager.connect(deviceId)), deviceId);
      const peripherals: Peripheral[] = await BleManager.getConnectedPeripherals();
      const device = peripherals.find((p) => p.id === deviceId) as BlePeripheral | undefined;
      if (!device) throw new Error('Device not found after connection');
      const info = await BleManager.retrieveServices(deviceId);

      this.connectedDevice = device;
      useBluetoothAudioStore.getState().setConnectedDevice(toAudioDevice(device, true));
      // A specialized handset reports PTT itself; CallKit mute actions from HFP would fight it.
      if (getDeviceType(device) === 'specialized') getCallKeepService().removeMuteListener();
      else getCallKeepService().restoreMuteListener();

      await this.setupButtonMonitoring(device, info);
      this.startMediaButtonFallback();
      this.setupAudioRouting(device);
      await this.playConnectedSound();
    } catch (error) {
      useBluetoothAudioStore.getState().setConnectionError(errorMessage(error));
      throw error;
    } finally {
      this.isConnecting = false;
      useBluetoothAudioStore.getState().setIsConnecting(false);
    }
  }

  async disconnectDevice(): Promise<void> {
    this.stopMonitoring();
    const device = this.connectedDevice;
    if (!device) return;
    try {
      await BleManager.disconnect(device.id);
    } catch (error) {
      logger.warn({ message: 'BLE disconnect failed', context: { error } });
    }
    this.handleDeviceDisconnected({ peripheral: device.id });
  }

  async isDeviceConnected(deviceId: string): Promise<boolean> {
    try {
      const peripherals: Peripheral[] = await BleManager.getConnectedPeripherals();
      return peripherals.some((p) => p.id === deviceId);
    } catch {
      return false;
    }
  }

  ensurePttInputMonitoring(reason: string): void {
    if (!this.connectedDevice) return;
    logger.debug({ message: 'Ensuring Bluetooth PTT input monitoring', context: { reason } });
    this.startMediaButtonFallback();
    this.startWatchdog(this.connectedDevice.id);
  }

  async destroy(): Promise<void> {
    this.stopMonitoring();
    this.clearConnectionTimeout();
    this.listeners.forEach((listener) => listener.remove());
    this.listeners = [];
    this.isInitialized = false;
    this.bleStarted = false;
    this.bleStartPromise = null;
    this.hasAttemptedPreferredDevice = false;
    await this.stopScanning().catch(() => undefined);
    await this.disconnectDevice().catch(() => undefined);
  }

  /** BLE notification (or a polled read) for the connected handset. */
  handleCharacteristicUpdate = (data: CharacteristicUpdate): void => {
    if (this.connectedDevice && data.peripheral !== this.connectedDevice.id) return;
    this.markNotificationConfirmed(data.service, data.characteristic);
    this.handleCharacteristicValue(data.service, data.characteristic, data.value, {
      hasVendorButtonCharacteristic: this.hasVendorButtonCharacteristic,
      isSpecializedDevice: this.connectedDevice !== null && getDeviceType(this.connectedDevice) === 'specialized',
    });
  };

  handleDeviceDiscovered = (device: BlePeripheral): void => {
    if (!device?.id || !device.advertising?.isConnectable) return;
    if (!device.rssi || device.rssi < STRONG_RSSI_THRESHOLD) return;
    if (!isAudioDevice(device)) return;
    const audioDevice = toAudioDevice(device, false);
    useBluetoothAudioStore.getState().addDevice(audioDevice);
    const { preferredDevice, connectedDevice } = useBluetoothAudioStore.getState();
    if (preferredDevice?.id === device.id && !connectedDevice && !this.isConnecting) {
      this.connectToDevice(device.id).catch((error) => logger.warn({ message: 'Auto-connect to preferred Bluetooth device failed', context: { error } }));
    }
  };

  handleDeviceDisconnected = ({ peripheral }: { peripheral: string }): void => {
    if (!this.connectedDevice || this.connectedDevice.id !== peripheral) return;
    this.connectedDevice = null;
    this.hasVendorButtonCharacteristic = false;
    this.stopMonitoring();
    const store = useBluetoothAudioStore.getState();
    store.setConnectedDevice(null);
    store.clearConnectionError();
    this.revertAudioRouting();
    getCallKeepService().restoreMuteListener();
  };

  handleBluetoothStateChange = ({ state }: { state: BleState | string }): void => {
    const next = mapBleState(state);
    const previous = useBluetoothAudioStore.getState().bluetoothState;
    useBluetoothAudioStore.getState().setBluetoothState(next);
    if (next === BluetoothState.PoweredOff || next === BluetoothState.Unauthorized) {
      void this.stopScanning();
      void this.disconnectDevice();
      useBluetoothAudioStore.getState().clearDevices();
      return;
    }
    if (next === BluetoothState.PoweredOn && this.isInitialized && !this.connectedDevice && !this.isConnecting) {
      const turnedBackOn = previous !== BluetoothState.PoweredOn && previous !== BluetoothState.Unknown;
      if (turnedBackOn || !this.hasAttemptedPreferredDevice) {
        this.hasAttemptedPreferredDevice = false;
        void this.attemptPreferredDeviceConnection();
      }
    }
  };

  private async attemptPreferredDeviceConnection(): Promise<void> {
    if (this.hasAttemptedPreferredDevice) return;
    this.hasAttemptedPreferredDevice = true;
    const preferred = this.loadPreferredDevice();
    if (!preferred || preferred.id === SYSTEM_AUDIO_DEVICE.id) return;
    try {
      await this.connectToDevice(preferred.id);
    } catch (error) {
      logger.warn({ message: 'Preferred Bluetooth device not reachable; scanning for it', context: { error } });
      await this.startScanning(5000).catch((scanError) => logger.warn({ message: 'Preferred device scan failed', context: { error: scanError } }));
    }
  }

  private ensureBleStarted(): Promise<void> {
    if (this.bleStarted) return Promise.resolve();
    if (!this.bleStartPromise) {
      const startPromise = BleManager.start({ showAlert: false })
        .then(() => {
          if (this.bleStartPromise !== startPromise) throw new Error('Bluetooth PTT was destroyed while BleManager was starting');
          this.listeners.push(
            BleManager.onDidUpdateState(this.handleBluetoothStateChange),
            BleManager.onDisconnectPeripheral(this.handleDeviceDisconnected),
            BleManager.onDiscoverPeripheral(this.handleDeviceDiscovered),
            BleManager.onDidUpdateValueForCharacteristic(this.handleCharacteristicUpdate),
            BleManager.onStopScan(() => this.handleScanStopped())
          );
          this.bleStarted = true;
        })
        .finally(() => {
          if (this.bleStartPromise === startPromise) this.bleStartPromise = null;
        });
      this.bleStartPromise = startPromise;
    }
    return this.bleStartPromise;
  }

  private handleScanStopped(): void {
    if (this.scanTimeout) clearTimeout(this.scanTimeout);
    this.scanTimeout = null;
    useBluetoothAudioStore.getState().setIsScanning(false);
  }

  private withConnectionTimeout<T>(operation: Promise<T>, deviceId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.clearConnectionTimeout();
      this.connectionTimeout = setTimeout(() => {
        this.connectionTimeout = null;
        Promise.resolve()
          .then(() => BleManager.disconnect(deviceId))
          .catch(() => undefined);
        reject(new Error('Timed out connecting to Bluetooth device'));
      }, BLE_CONNECTION_TIMEOUT_MS);
      operation.then(
        (value) => {
          this.clearConnectionTimeout();
          resolve(value);
        },
        (error: unknown) => {
          this.clearConnectionTimeout();
          reject(error);
        }
      );
    });
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
    this.connectionTimeout = null;
  }

  /** Subscribe vendor button characteristics first, then likely/notifiable ones; register readable ones for polling. */
  async setupButtonMonitoring(device: BlePeripheral, info: PeripheralInfo): Promise<void> {
    const store = useBluetoothAudioStore.getState();
    store.setIsHeadsetButtonMonitoring(false);
    this.monitoringStartedAt = Date.now();
    this.readPolls = [];
    this.hasVendorButtonCharacteristic = false;
    const subscribed = new Set<string>();
    const characteristics = info.characteristics ?? [];
    const isSpecialized = getDeviceType(device) === 'specialized';

    for (const vendor of VENDOR_BUTTON_CHARACTERISTICS) {
      if (!characteristics.some((c) => areUuidsEqual(c.service, vendor.service) && areUuidsEqual(c.characteristic, vendor.characteristic))) continue;
      try {
        await BleManager.startNotification(device.id, vendor.service, vendor.characteristic);
        subscribed.add(characteristicKey(vendor.service, vendor.characteristic));
        this.hasVendorButtonCharacteristic = true;
        this.registerReadPoll(vendor.service, vendor.characteristic);
      } catch (error) {
        logger.warn({ message: 'Failed to subscribe vendor button characteristic', context: { family: vendor.family, error } });
      }
    }

    for (const characteristic of characteristics) {
      const { service, characteristic: uuid, properties } = characteristic;
      if (!service || !uuid || isExcludedStandardCharacteristic(uuid)) continue;
      const key = characteristicKey(service, uuid);
      const shouldSubscribe = isSpecialized || isLikelyButtonCharacteristic(service, uuid) || canNotifyOrRead(properties);
      if (!shouldSubscribe || subscribed.has(key)) continue;
      try {
        await BleManager.startNotification(device.id, service, uuid);
        subscribed.add(key);
        if (canRead(properties)) this.registerReadPoll(service, uuid);
      } catch (error) {
        logger.debug({ message: 'Fallback BLE subscription failed', context: { error } });
      }
    }

    const monitoring = subscribed.size > 0;
    useBluetoothAudioStore.getState().setIsHeadsetButtonMonitoring(monitoring);
    if (monitoring) {
      this.startReadPolling(device.id);
      this.startWatchdog(device.id);
    }
  }

  private registerReadPoll(service: string, characteristic: string): void {
    if (this.readPolls.some((entry) => areUuidsEqual(entry.service, service) && areUuidsEqual(entry.characteristic, characteristic))) return;
    this.readPolls.push({ service, characteristic, lastHex: null, notificationConfirmed: false, failures: 0 });
  }

  /** A real notification arrived: polling that characteristic would only replay stale values (duplicate presses). */
  private markNotificationConfirmed(service: string, characteristic: string): void {
    for (const entry of this.readPolls) {
      if (areUuidsEqual(entry.service, service) && areUuidsEqual(entry.characteristic, characteristic)) entry.notificationConfirmed = true;
    }
  }

  private startReadPolling(deviceId: string): void {
    this.stopReadPolling();
    if (this.readPolls.length === 0) return;
    this.readPollTimer = setInterval(() => {
      if (!this.connectedDevice || this.connectedDevice.id !== deviceId || !useBluetoothAudioStore.getState().isHeadsetButtonMonitoring || this.readPolls.every((entry) => entry.notificationConfirmed)) {
        this.stopReadPolling();
        return;
      }
      if (this.readPollInFlight) return;
      this.readPollInFlight = true;
      void this.pollReads(deviceId).finally(() => {
        this.readPollInFlight = false;
      });
    }, READ_POLL_INTERVAL_MS);
  }

  /** One polling pass (exposed for tests). */
  async pollReads(deviceId: string): Promise<void> {
    for (const entry of [...this.readPolls]) {
      if (entry.notificationConfirmed) continue;
      try {
        const value = await BleManager.read(deviceId, entry.service, entry.characteristic);
        entry.failures = 0;
        // A notification for this characteristic landed while the read was in flight: its value is already handled.
        if (entry.notificationConfirmed) continue;
        const hex = value.map((b) => b.toString(16).padStart(2, '0')).join('');
        if (entry.lastHex === null) {
          entry.lastHex = hex;
          continue;
        }
        if (hex === entry.lastHex) continue;
        entry.lastHex = hex;
        this.handleCharacteristicValue(entry.service, entry.characteristic, value, {
          hasVendorButtonCharacteristic: this.hasVendorButtonCharacteristic,
          isSpecializedDevice: this.connectedDevice !== null && getDeviceType(this.connectedDevice) === 'specialized',
        });
      } catch (error) {
        entry.failures += 1;
        if (entry.failures >= READ_POLL_MAX_CONSECUTIVE_FAILURES) {
          this.readPolls = this.readPolls.filter((candidate) => candidate !== entry);
          logger.debug({ message: 'Stopped read-polling a characteristic after repeated failures', context: { error } });
        }
      }
    }
  }

  private stopReadPolling(): void {
    if (this.readPollTimer) clearInterval(this.readPollTimer);
    this.readPollTimer = null;
    this.readPollInFlight = false;
  }

  private startWatchdog(deviceId: string): void {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (!this.connectedDevice || this.connectedDevice.id !== deviceId || !useBluetoothAudioStore.getState().isHeadsetButtonMonitoring) {
        this.stopWatchdog();
        return;
      }
      if (this.monitoringStartedAt && Date.now() - this.monitoringStartedAt >= WATCHDOG_RECOVERY_MS) {
        this.monitoringStartedAt = Date.now();
        this.startMediaButtonFallback();
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  /** Android handsets that report PTT as media keys (Unit): borrow the headset-button service while a device is connected. */
  private startMediaButtonFallback(): void {
    if (Platform.OS !== 'android' || this.mediaFallbackActive) return;
    getHeadsetButtonService().startMonitoring('bluetooth');
    this.mediaFallbackActive = true;
  }

  private stopMonitoring(): void {
    useBluetoothAudioStore.getState().setIsHeadsetButtonMonitoring(false);
    this.press.reset();
    this.stopWatchdog();
    this.stopReadPolling();
    if (this.mediaFallbackActive) {
      getHeadsetButtonService().stopMonitoring('bluetooth');
      this.mediaFallbackActive = false;
    }
  }
}
