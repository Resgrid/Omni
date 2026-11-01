import { getVoiceCapabilities } from '../capabilities';
import type { BluetoothAudioService } from './types';

let instance: BluetoothAudioService | null = null;

/**
 * The Bluetooth PTT service (Dispatch factory.service): react-native-ble-manager on iOS/Android, required lazily and
 * only when the variant declares `capabilities.voice.bluetoothPtt` (BigBoard never loads the BLE module). Null when
 * Bluetooth PTT is not available in this app.
 */
export function getBluetoothAudioService(): BluetoothAudioService | null {
  if (instance) return instance;
  if (!getVoiceCapabilities().bluetoothPtt) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NativeBluetoothAudioService } = require('./bluetooth-service-native') as { NativeBluetoothAudioService: new () => BluetoothAudioService };
  instance = new NativeBluetoothAudioService();
  return instance;
}

/** Test helper. Not for app code. */
export function resetBluetoothAudioServiceForTests(): void {
  instance = null;
}
