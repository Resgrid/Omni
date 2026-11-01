import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** Labels for the member's own session list (display text only; the server trusts none of it). */
export interface DeviceLabels {
  deviceName: string | null;
  modelName: string | null;
  osName: string;
  osVersion: string | null;
  appVersion: string | null;
}

export type DeviceLabelProvider = () => DeviceLabels;

const read = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/** expo-device / expo-application (null on web where they have nothing to say). */
export const expoDeviceLabels: DeviceLabelProvider = () => ({
  deviceName: read(() => Device.deviceName ?? null, null),
  modelName: read(() => Device.modelName ?? null, null),
  osName: Platform.OS,
  osVersion: read(() => Device.osVersion ?? null, null),
  appVersion: read(() => Application.nativeApplicationVersion ?? null, null),
});
