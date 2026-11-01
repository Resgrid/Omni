/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so they require modules lazily. */
// Package-local Jest mocks for @resgrid/ui. Native modules have no implementation under Jest; these stand-ins keep
// the props the components set so tests can assert on them. jest.mock factories may only reference `mock*` names.
import '@testing-library/react-native/extend-expect';

// react-aria (pulled in by gluestack) probes window.screen at import time when NODE_ENV is 'test'; the React Native
// test environment has a window without a screen, which makes Reflect.has throw.
const mockGlobalWindow = globalThis as unknown as { window?: { screen?: object } };
if (mockGlobalWindow.window && !mockGlobalWindow.window.screen) {
  mockGlobalWindow.window.screen = {};
}

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));

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

// NativeWind v5 resolves className through react-native-css at runtime; under Jest the components only need to render.
jest.mock('nativewind', () => ({
  __esModule: true,
  styled: jest.fn((Component: unknown) => Component),
  vars: jest.fn((v: unknown) => v),
  useColorScheme: jest.fn(() => ({ colorScheme: 'light', setColorScheme: jest.fn(), toggleColorScheme: jest.fn() })),
}));

// A WebView stand-in that exposes the generated document and the security-relevant props.
jest.mock('react-native-webview', () => {
  const mockReact = require('react');
  const { View, Text } = require('react-native');
  const MockWebView = ({ source, ...rest }: { source: { html: string } }) => mockReact.createElement(View, { testID: 'native-webview', ...rest }, mockReact.createElement(Text, { testID: 'webview-html' }, source.html));
  return { __esModule: true, default: MockWebView, WebView: MockWebView };
});

jest.mock('expo-image', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return { Image: (props: Record<string, unknown>) => mockReact.createElement(View, { ...props, testID: props.testID ?? 'expo-image' }) };
});

jest.mock('expo-router', () => ({
  useIsFocused: jest.fn(() => true),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock('expo-navigation-bar', () => ({ setVisibilityAsync: jest.fn(() => Promise.resolve()) }));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// Translations: keys come back verbatim unless a defaultValue is given, which is what the UI falls back to.
jest.mock('@resgrid/i18n', () => {
  const mockT = (key: string, options?: { defaultValue?: string; count?: number }) => (options?.defaultValue ? options.defaultValue.replace('{{count}}', String(options.count ?? '')) : key);
  return {
    useTranslation: () => ({ t: mockT, i18n: { language: 'en', exists: () => false } }),
    translate: mockT,
  };
});
