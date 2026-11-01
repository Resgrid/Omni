/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so they require modules lazily. */
// Package-local Jest mocks for @resgrid/app-shell. jest.mock factories may only reference `mock*` names.
import '@testing-library/react-native/extend-expect';

// react-aria (pulled in by gluestack) probes window.screen at import time when NODE_ENV is 'test'.
const mockGlobalWindow = globalThis as unknown as { window?: { screen?: object } };
if (mockGlobalWindow.window && !mockGlobalWindow.window.screen) {
  mockGlobalWindow.window.screen = {};
}

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
jest.mock('react-native-gesture-handler', () => {
  const mockReact = require('react');
  return { GestureHandlerRootView: ({ children }: { children?: unknown }) => mockReact.createElement(mockReact.Fragment, null, children) };
});

jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  const mockFrame = { x: 0, y: 0, width: 375, height: 667 };
  return {
    SafeAreaView: ({ children, ...props }: { children?: unknown }) => mockReact.createElement(require('react-native').View, props, children),
    SafeAreaProvider: ({ children }: { children?: unknown }) => children,
    useSafeAreaInsets: jest.fn(() => mockInsets),
    useSafeAreaFrame: jest.fn(() => mockFrame),
    initialWindowMetrics: { insets: mockInsets, frame: mockFrame },
  };
});

jest.mock('nativewind', () => ({
  __esModule: true,
  styled: jest.fn((Component: unknown) => Component),
  vars: jest.fn((v: unknown) => v),
  useColorScheme: jest.fn(() => ({ colorScheme: 'light', setColorScheme: jest.fn(), toggleColorScheme: jest.fn() })),
}));

jest.mock('react-native-webview', () => ({ __esModule: true, default: () => null, WebView: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-navigation-bar', () => ({ setVisibilityAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native-edge-to-edge', () => ({ SystemBars: () => null }));
jest.mock('expo-linking', () => ({ getInitialURL: jest.fn(async () => null), addEventListener: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn(), openAuthSessionAsync: jest.fn(), openBrowserAsync: jest.fn() }));
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  reactNavigationIntegration: jest.fn(() => ({ registerNavigationContainer: jest.fn() })),
}));

jest.mock('countly-sdk-react-native-bridge', () => ({ __esModule: true, default: { initWithConfig: jest.fn(), events: { recordEvent: jest.fn() } } }));
jest.mock('countly-sdk-react-native-bridge/CountlyConfig', () => ({ __esModule: true, default: jest.fn() }));

jest.mock('expo-router', () => require('./src/__tests__/mocks/expo-router'));

// L3/L4 packages that wrap device services are mocked at their boundary (src/__tests__/mocks/platform.ts).
jest.mock('@resgrid/notifications', () => require('./src/__tests__/mocks/platform').notifications);
jest.mock('@resgrid/realtime', () => require('./src/__tests__/mocks/platform').realtime);
jest.mock('@resgrid/voice', () => require('./src/__tests__/mocks/platform').voice);
jest.mock('@resgrid/location', () => require('./src/__tests__/mocks/platform').location);
jest.mock('@resgrid/data', () => require('./src/__tests__/mocks/platform').data);

// Translations: the English default (or the key) with {{name}} interpolation — what the UI shows before keys merge.
jest.mock('@resgrid/i18n', () => {
  const mockT = (key: string, options?: Record<string, unknown>): string => {
    const fallback = typeof options?.defaultValue === 'string' ? options.defaultValue : key;
    return fallback.replace(/\{\{(\w+)\}\}/g, (match: string, name: string) => (options && name in options ? String(options[name]) : match));
  };
  return {
    useTranslation: () => ({ t: mockT, i18n: { language: 'en', exists: () => false } }),
    translate: mockT,
    initI18n: jest.fn(),
    loadLanguage: jest.fn(() => Promise.resolve(true)),
    getCurrentLanguage: () => 'en',
    isSupportedLanguage: (value: unknown) => typeof value === 'string' && ['en', 'ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'sv', 'uk'].includes(value),
    LEGACY_LANGUAGE_STORAGE_KEY: 'local',
  };
});
