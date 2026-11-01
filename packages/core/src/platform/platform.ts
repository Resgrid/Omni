import { Platform } from 'react-native';

/**
 * Platform detection (omni-plan §7.1: Unit/IC platform.ts + Dispatch). Functions rather than constants so they
 * read the current environment and stay testable. Electron renders the web build, so `isWeb()` is also true
 * there; use `isElectron()` for desktop-only behaviour.
 */

/** The bridge the Electron preload script exposes as `window.electronAPI` (SSO, desktop push, notifications). */
export interface ElectronBridge {
  platform?: string;
  isElectron?: boolean;
  [method: string]: unknown;
}

interface ElectronWindow {
  __ELECTRON__?: unknown;
  electronAPI?: ElectronBridge;
  process?: { type?: string };
}

const electronWindow = (): ElectronWindow | null => (typeof window === 'undefined' || window === null ? null : (window as unknown as ElectronWindow));

export const isWeb = (): boolean => Platform.OS === 'web';
export const isIOS = (): boolean => Platform.OS === 'ios';
export const isAndroid = (): boolean => Platform.OS === 'android';
/** iOS or Android. */
export const isNative = (): boolean => isIOS() || isAndroid();

/**
 * Running inside the Omni Electron shell: the preload flag `window.__ELECTRON__` (Dispatch), the preload bridge
 * `window.electronAPI` (Unit/IC/BigBoard), a renderer `process`, or an Electron user agent.
 */
export const isElectron = (): boolean => {
  if (!isWeb()) return false;
  const w = electronWindow();
  if (!w) return false;
  if (w.__ELECTRON__ || w.electronAPI || w.process?.type === 'renderer') return true;
  return typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' && /Electron/i.test(navigator.userAgent);
};

/** The preload bridge, when running in Electron. */
export const getElectronBridge = (): ElectronBridge | null => (isElectron() ? (electronWindow()?.electronAPI ?? null) : null);

/** Electron or a native desktop React Native target. */
export const isDesktop = (): boolean => isElectron() || Platform.OS === 'macos' || Platform.OS === 'windows';

/** Expo push tokens exist only on iOS and Android devices. */
export const isNativePushSupported = (): boolean => isNative();

/** Desktop notifications: Electron with the Notification API. */
export const isDesktopNotificationSupported = (): boolean => isElectron() && typeof window !== 'undefined' && 'Notification' in window;

/** Human-readable platform name for diagnostics (never shown as a translated label). */
export const platformName = (): string => {
  if (isElectron()) {
    const os = getElectronBridge()?.platform;
    if (os === 'darwin') return 'macOS (Electron)';
    if (os === 'win32') return 'Windows (Electron)';
    if (os === 'linux') return 'Linux (Electron)';
    return 'Electron';
  }
  const os: string = Platform.OS;
  switch (os) {
    case 'ios':
      return 'iOS';
    case 'android':
      return 'Android';
    case 'web':
      return 'Web';
    case 'macos':
      return 'macOS';
    case 'windows':
      return 'Windows';
    default:
      return os;
  }
};
