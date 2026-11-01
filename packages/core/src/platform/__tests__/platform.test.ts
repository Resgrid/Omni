// Ported from Dispatch src/lib/__tests__/platform.test.ts, extended with Unit/IC's electronAPI bridge detection.
import { getElectronBridge, isAndroid, isDesktop, isDesktopNotificationSupported, isElectron, isIOS, isNative, isNativePushSupported, isWeb, platformName } from '../platform';

const mockPlatformOS = jest.fn<string, []>();
jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS();
    },
  },
}));

const setGlobal = (name: 'window' | 'navigator', value: unknown) => Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });

describe('platform detection', () => {
  afterEach(() => {
    setGlobal('window', undefined);
    setGlobal('navigator', undefined);
  });

  it('reports the React Native platform', () => {
    mockPlatformOS.mockReturnValue('ios');
    expect([isIOS(), isAndroid(), isWeb(), isNative()]).toEqual([true, false, false, true]);
    mockPlatformOS.mockReturnValue('android');
    expect([isIOS(), isAndroid(), isWeb(), isNative()]).toEqual([false, true, false, true]);
    mockPlatformOS.mockReturnValue('web');
    expect([isIOS(), isAndroid(), isWeb(), isNative()]).toEqual([false, false, true, false]);
  });

  describe('isElectron', () => {
    it('is false on iOS and Android even when a window exists', () => {
      setGlobal('window', { __ELECTRON__: true });
      mockPlatformOS.mockReturnValue('ios');
      expect(isElectron()).toBe(false);
      mockPlatformOS.mockReturnValue('android');
      expect(isElectron()).toBe(false);
    });

    it('detects the Dispatch preload flag window.__ELECTRON__', () => {
      mockPlatformOS.mockReturnValue('web');
      setGlobal('window', { __ELECTRON__: true });
      expect(isElectron()).toBe(true);
    });

    it('detects the Unit/IC/BigBoard preload bridge window.electronAPI', () => {
      mockPlatformOS.mockReturnValue('web');
      setGlobal('window', { electronAPI: { platform: 'win32' } });
      expect(isElectron()).toBe(true);
      expect(getElectronBridge()).toEqual({ platform: 'win32' });
    });

    it('falls back to an Electron user agent', () => {
      mockPlatformOS.mockReturnValue('web');
      setGlobal('window', {});
      setGlobal('navigator', { userAgent: 'Mozilla/5.0 Electron/40.0.0' });
      expect(isElectron()).toBe(true);
    });

    it('is false in a regular browser', () => {
      mockPlatformOS.mockReturnValue('web');
      setGlobal('window', {});
      setGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/140.0.0' });
      expect(isElectron()).toBe(false);
      expect(getElectronBridge()).toBeNull();
    });

    it('is false when window is undefined', () => {
      mockPlatformOS.mockReturnValue('web');
      expect(isElectron()).toBe(false);
    });
  });

  it('treats Electron as desktop', () => {
    mockPlatformOS.mockReturnValue('web');
    setGlobal('window', { __ELECTRON__: true });
    expect(isDesktop()).toBe(true);
    setGlobal('window', {});
    expect(isDesktop()).toBe(false);
  });

  it('supports native push only on iOS and Android', () => {
    mockPlatformOS.mockReturnValue('ios');
    expect(isNativePushSupported()).toBe(true);
    mockPlatformOS.mockReturnValue('web');
    expect(isNativePushSupported()).toBe(false);
  });

  it('supports desktop notifications in Electron with the Notification API only', () => {
    mockPlatformOS.mockReturnValue('web');
    setGlobal('window', { __ELECTRON__: true, Notification: function Notification() {} });
    expect(isDesktopNotificationSupported()).toBe(true);
    setGlobal('window', { Notification: function Notification() {} });
    setGlobal('navigator', { userAgent: 'Chrome' });
    expect(isDesktopNotificationSupported()).toBe(false);
    mockPlatformOS.mockReturnValue('ios');
    expect(isDesktopNotificationSupported()).toBe(false);
  });

  it('names the platform, including Electron host OS', () => {
    mockPlatformOS.mockReturnValue('web');
    setGlobal('window', { electronAPI: { platform: 'darwin' } });
    expect(platformName()).toBe('macOS (Electron)');
    setGlobal('window', { __ELECTRON__: true });
    expect(platformName()).toBe('Electron');
    setGlobal('window', {});
    setGlobal('navigator', { userAgent: 'Chrome' });
    expect(platformName()).toBe('Web');
    mockPlatformOS.mockReturnValue('android');
    expect(platformName()).toBe('Android');
  });
});
