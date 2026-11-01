/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so they require modules lazily. */
// Shared test setup for the auth-ui and settings features: the native-module mocks @resgrid/ui's own jest.setup provides
// (packages/features/jest.config.js has none yet), plus a key-echoing i18n mock. Import it first in every test file.
import '@testing-library/react-native/extend-expect';

import type { useToastStore } from '@resgrid/ui/toast/store';
import { configure } from '@testing-library/react-native';

type ToastStore = typeof useToastStore;

// Modal and bottom-sheet content is only reachable with hidden elements included (RNTL 12 treats the host Modal as hidden).
configure({ defaultIncludeHiddenElements: true });

const mockGlobalWindow = globalThis as unknown as { window?: { screen?: object } };
if (mockGlobalWindow.window && !mockGlobalWindow.window.screen) {
  mockGlobalWindow.window.screen = {};
}

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const builder: unknown = new Proxy(function mockBuilder() {}, { get: () => builder, apply: () => builder });
  const Animated = { View: RN.View, Text: RN.Text, ScrollView: RN.ScrollView, Image: RN.Image, FlatList: RN.FlatList, createAnimatedComponent: (component: unknown) => component };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    Easing: builder,
    FadeIn: builder,
    FadeOut: builder,
    ZoomIn: builder,
    SlideInUp: builder,
    SlideInDown: builder,
    SlideInLeft: builder,
    SlideInRight: builder,
    SlideOutUp: builder,
    SlideOutDown: builder,
    SlideOutLeft: builder,
    SlideOutRight: builder,
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: unknown) => value,
    withSpring: (value: unknown) => value,
  };
});
jest.mock('@legendapp/motion', () => {
  const RN = require('react-native');
  return {
    AnimatePresence: ({ children }: { children?: unknown }) => children,
    Motion: { View: RN.View, Pressable: RN.Pressable, Text: RN.Text },
    createMotionAnimatedComponent: (component: unknown) => component,
  };
});
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
jest.mock('nativewind', () => ({
  __esModule: true,
  styled: jest.fn((Component: unknown) => Component),
  vars: jest.fn((v: unknown) => v),
  useColorScheme: jest.fn(() => ({ colorScheme: 'light', setColorScheme: jest.fn(), toggleColorScheme: jest.fn() })),
}));
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
jest.mock('react-native-webview', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  const MockWebView = (props: Record<string, unknown>) => mockReact.createElement(View, { testID: 'native-webview', ...props });
  return { __esModule: true, default: MockWebView, WebView: MockWebView };
});
jest.mock('expo-image', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return { Image: (props: Record<string, unknown>) => mockReact.createElement(View, { ...props, testID: props.testID ?? 'expo-image' }) };
});
jest.mock('expo-router', () => ({
  useIsFocused: jest.fn(() => true),
  useFocusEffect: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
  useRouter: jest.fn(() => require('expo-router').router),
}));
jest.mock('expo-navigation-bar', () => ({ setVisibilityAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native-edge-to-edge', () => ({ SystemBars: () => null }));
jest.mock('countly-sdk-react-native-bridge', () => ({ __esModule: true, default: { initWithConfig: jest.fn(), events: { recordEvent: jest.fn() }, userData: { setProperties: jest.fn() } } }));
jest.mock('countly-sdk-react-native-bridge/CountlyConfig', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  wrap: (component: unknown) => component,
  reactNavigationIntegration: jest.fn(() => ({})),
}));

// Translations: the key comes back, with interpolated values appended (`key [count=3]`) so tests can assert on both.
jest.mock('@resgrid/i18n', () => {
  const mockFormat = (key: string, options?: Record<string, unknown>): string => {
    const values = Object.entries(options ?? {}).filter(([name, value]) => name !== 'defaultValue' && (typeof value === 'string' || typeof value === 'number'));
    return values.length > 0 ? `${key} [${values.map(([name, value]) => `${name}=${String(value)}`).join(',')}]` : key;
  };
  const mockI18n = { language: 'en', exists: () => true };
  return {
    SUPPORTED_LANGUAGES: ['en', 'ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'sv', 'uk'],
    LEGACY_LANGUAGE_STORAGE_KEY: 'local',
    isSupportedLanguage: (value: unknown) => typeof value === 'string' && ['en', 'ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'sv', 'uk'].includes(value),
    useTranslation: () => ({ t: mockFormat, i18n: mockI18n }),
    translate: mockFormat,
    getCurrentLanguage: () => mockI18n.language,
    setLanguage: jest.fn(async (language: string) => {
      mockI18n.language = language;
    }),
  };
});

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(() => ({ type: 'failed' })),
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
  openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
  dismissBrowser: jest.fn(),
  WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss', OPENED: 'opened', LOCKED: 'locked' },
}));

// Toasts keep a dismissal timer each; clearing them after every test lets Jest exit promptly.
afterEach(() => {
  (require('@resgrid/ui/toast/store') as { useToastStore: ToastStore }).useToastStore.getState().clearToasts();
});
