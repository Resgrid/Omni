import { logger } from '@resgrid/core';

import { voiceSounds } from '../audio/voice-sounds';
import { getCallKeepService } from '../callkeep/callkeep-service';
import { PttPressController } from '../ptt/ptt-press-controller';
import { getVoiceRuntime, PREFERRED_BLUETOOTH_DEVICE_KEY } from '../runtime';
import type { ByteSource } from '../util/bytes';
import { findDefaultAudioDevices, useBluetoothAudioStore } from './bluetooth-audio-store';
import { type CharacteristicRoutingContext, type DeviceFamily, parseButtonData, parseHexButtonData, routeCharacteristic, supportsMicrophoneControl } from './device-profiles';
import { type AudioButtonEvent, type BlePeripheral, type BluetoothAudioService, type BluetoothState, type PreferredBluetoothDevice, SYSTEM_AUDIO_DEVICE } from './types';

/**
 * Shared behaviour of the native and web Bluetooth PTT services (Dispatch base.service split + Unit device logic):
 * characteristic routing and button parsing, the press-and-hold state machine, CallKeep coordination, call audio
 * selection in the store, and the preferred device (persisted under its legacy key).
 */
export abstract class BluetoothAudioServiceBase implements BluetoothAudioService {
  abstract readonly platform: 'native' | 'web';
  readonly press = new PttPressController('bluetooth');
  protected hasVendorButtonCharacteristic = false;

  abstract isSupported(): boolean;
  abstract initialize(): Promise<void>;
  abstract requestPermissions(): Promise<boolean>;
  abstract checkBluetoothState(): Promise<BluetoothState>;
  abstract startScanning(durationMs?: number): Promise<void>;
  abstract stopScanning(): Promise<void>;
  abstract connectToDevice(deviceId: string): Promise<void>;
  abstract disconnectDevice(): Promise<void>;
  abstract isDeviceConnected(deviceId: string): Promise<boolean>;
  abstract ensurePttInputMonitoring(reason: string): void;
  abstract destroy(): Promise<void>;

  /** Route a characteristic update through the device profiles and act on the parsed button. */
  handleCharacteristicValue(service: string, characteristic: string, value: ByteSource, context: CharacteristicRoutingContext): AudioButtonEvent | null {
    const family = routeCharacteristic(service, characteristic, context);
    if (!family) return null;
    const event = parseButtonData(family, value);
    if (event) this.processButtonEvent(event, 'ble');
    return event;
  }

  processButtonEvent(event: AudioButtonEvent, source: 'ble' | 'media' = 'ble'): void {
    useBluetoothAudioStore.getState().setLastButtonEvent(event);
    switch (event.button) {
      case 'mute':
        void this.press.toggle();
        return;
      case 'ptt_start':
        this.press.press(source);
        return;
      case 'ptt_stop':
        this.press.release();
        return;
      case 'volume_up':
      case 'volume_down':
        logger.debug({ message: 'Bluetooth volume button pressed', context: { button: event.button } });
        return;
      default:
        return;
    }
  }

  testButtonMapping(family: DeviceFamily, hex: string): AudioButtonEvent | null {
    return parseHexButtonData(family, hex);
  }

  async connectToSystemAudio(): Promise<void> {
    await this.disconnectDevice();
    getCallKeepService().restoreMuteListener();
    this.revertAudioRouting();
    this.setPreferredDevice(SYSTEM_AUDIO_DEVICE);
  }

  setPreferredDevice(device: PreferredBluetoothDevice | null): void {
    useBluetoothAudioStore.getState().setPreferredDevice(device);
    const storage = getVoiceRuntime().storage;
    if (!storage) return;
    try {
      if (device) storage.setJSON(PREFERRED_BLUETOOTH_DEVICE_KEY, device);
      else storage.delete(PREFERRED_BLUETOOTH_DEVICE_KEY);
    } catch (error) {
      logger.warn({ message: 'Failed to persist preferred Bluetooth device', context: { error } });
    }
  }

  /** Drop a device as preferred, disconnect it, and move audio selections that pointed at it back to built-in devices (Unit). */
  async forgetPreferredDevice(deviceId: string): Promise<void> {
    const store = useBluetoothAudioStore.getState();
    if (store.preferredDevice?.id === deviceId) this.setPreferredDevice(null);
    if (store.connectedDevice?.id === deviceId) await this.disconnectDevice();
    const { selectedAudioDevices, availableAudioDevices } = useBluetoothAudioStore.getState();
    const defaults = findDefaultAudioDevices(availableAudioDevices);
    if (selectedAudioDevices.microphone?.id === deviceId && defaults.microphone) store.setSelectedMicrophone(defaults.microphone);
    if (selectedAudioDevices.speaker?.id === deviceId && defaults.speaker) store.setSelectedSpeaker(defaults.speaker);
  }

  protected loadPreferredDevice(): PreferredBluetoothDevice | null {
    const storage = getVoiceRuntime().storage;
    if (!storage) return useBluetoothAudioStore.getState().preferredDevice;
    try {
      const device = storage.getJSON<PreferredBluetoothDevice>(PREFERRED_BLUETOOTH_DEVICE_KEY);
      if (device && typeof device.id === 'string') {
        useBluetoothAudioStore.getState().setPreferredDevice(device);
        return device;
      }
    } catch (error) {
      logger.warn({ message: 'Failed to read preferred Bluetooth device', context: { error } });
    }
    return null;
  }

  /** Make the handset the call's speaker (and microphone when it has HFP/HSP) — the LiveKit store re-routes on change. */
  protected setupAudioRouting(device: BlePeripheral): void {
    const store = useBluetoothAudioStore.getState();
    const entry = { id: device.id, name: device.name || 'Bluetooth Device', type: 'bluetooth' as const, isAvailable: true };
    store.setAvailableAudioDevices([...store.availableAudioDevices.filter((d) => d.type !== 'bluetooth'), entry]);
    if (supportsMicrophoneControl(device)) store.setSelectedMicrophone(entry);
    store.setSelectedSpeaker(entry);
  }

  protected revertAudioRouting(): void {
    const store = useBluetoothAudioStore.getState();
    const local = store.availableAudioDevices.filter((d) => d.type !== 'bluetooth');
    store.setAvailableAudioDevices(local);
    const defaults = findDefaultAudioDevices(local);
    if (defaults.microphone) store.setSelectedMicrophone(defaults.microphone);
    if (defaults.speaker) store.setSelectedSpeaker(defaults.speaker);
    store.setIsHeadsetButtonMonitoring(false);
    this.press.reset();
  }

  protected playConnectedSound(): Promise<void> {
    return voiceSounds.play('connectedDevice');
  }
}
