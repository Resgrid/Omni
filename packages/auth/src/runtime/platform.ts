import { isDev } from '@resgrid/core/dev';
import { Platform } from 'react-native';

/** `ios`, `android`, `web` (browser and Electron renderer), … */
export const platformOS = (): string => Platform.OS;

export const isWebPlatform = (): boolean => Platform.OS === 'web';

export const isNativePlatform = (): boolean => Platform.OS === 'ios' || Platform.OS === 'android';

let developmentOverride: boolean | null = null;

/** Development build (http to localhost allowed for server and SSO URLs). Tests may override. */
export const isDevelopmentBuild = (): boolean => (developmentOverride === null ? isDev() : developmentOverride);

/** Test hook. */
export function setDevelopmentBuildForTests(value: boolean | null): void {
  developmentOverride = value;
}
