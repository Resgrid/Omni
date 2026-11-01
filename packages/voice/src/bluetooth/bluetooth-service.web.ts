import { getVoiceCapabilities } from '../capabilities';
import { WebBluetoothAudioService } from './bluetooth-service-web';
import type { BluetoothAudioService } from './types';

let instance: BluetoothAudioService | null = null;

/** Web Bluetooth (Chrome, Edge, Electron) when the variant declares Bluetooth PTT and the browser exposes `navigator.bluetooth`. */
export function getBluetoothAudioService(): BluetoothAudioService | null {
  if (instance) return instance;
  if (!getVoiceCapabilities().bluetoothPtt) return null;
  instance = new WebBluetoothAudioService();
  return instance;
}

export function resetBluetoothAudioServiceForTests(): void {
  instance = null;
}
