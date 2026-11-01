/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
// Shared Jest setup for Unit's signature modules (unit-status, unit-routes, inventory). Import it as the FIRST import of a
// test file so the mocks register before @resgrid/ui (gluestack, NativeWind) loads. Mirrors the status feature's setup,
// plus stand-ins for voice (LiveKit) and location, whose native modules have no Jest implementation. Helpers live in
// ./test-helpers (keep this file side-effect only so it can stay the first import).
import '@testing-library/react-native/extend-expect';

// react-aria (pulled in by gluestack) probes window.screen at import time; the RN test window has none.
const mockGlobalWindow = globalThis as unknown as { window?: { screen?: object } };
if (mockGlobalWindow.window && !mockGlobalWindow.window.screen) {
  mockGlobalWindow.window.screen = {};
}

jest.mock('react-native-worklets', () => ({ __esModule: true, scheduleOnRN: (fn: () => void) => fn(), runOnJS: (fn: unknown) => fn }));
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const passthrough = (value: unknown) => value;
  const animated = { View: RN.View, Text: RN.Text, Image: RN.Image, ScrollView: RN.ScrollView, FlatList: RN.FlatList, createAnimatedComponent: passthrough };
  const layoutAnimation: unknown = new Proxy(function mockLayoutAnimation() {}, { get: () => layoutAnimation, apply: () => layoutAnimation });
  return {
    __esModule: true,
    default: animated,
    ...animated,
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useAnimatedProps: () => ({}),
    useAnimatedReaction: () => undefined,
    withTiming: passthrough,
    withSpring: passthrough,
    withRepeat: passthrough,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withDelay: (_delay: number, value: unknown) => value,
    cancelAnimation: () => undefined,
    runOnJS: (fn: unknown) => fn,
    interpolate: () => 0,
    Extrapolation: { CLAMP: 'clamp' },
    Easing: { linear: passthrough, ease: passthrough, in: passthrough, out: passthrough, inOut: passthrough, bezier: () => passthrough },
    FadeIn: layoutAnimation,
    FadeOut: layoutAnimation,
    ZoomIn: layoutAnimation,
    ZoomOut: layoutAnimation,
    SlideInDown: layoutAnimation,
    SlideOutDown: layoutAnimation,
    SlideInUp: layoutAnimation,
    SlideOutUp: layoutAnimation,
    SlideInLeft: layoutAnimation,
    SlideOutLeft: layoutAnimation,
    SlideInRight: layoutAnimation,
    SlideOutRight: layoutAnimation,
    Layout: layoutAnimation,
    LinearTransition: layoutAnimation,
  };
});

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

jest.mock('nativewind', () => ({
  __esModule: true,
  styled: jest.fn((Component: unknown) => Component),
  vars: jest.fn((v: unknown) => v),
  useColorScheme: jest.fn(() => ({ colorScheme: 'light', setColorScheme: jest.fn(), toggleColorScheme: jest.fn() })),
}));

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

jest.mock('@shopify/flash-list', () => {
  const { FlatList } = require('react-native');
  return { FlashList: FlatList };
});

jest.mock('expo-router', () => {
  const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    useIsFocused: jest.fn(() => true),
    router: mockRouter,
    useRouter: () => mockRouter,
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: jest.fn(),
    Redirect: ({ href }: { href: string }) => require('react').createElement(require('react-native').Text, { testID: 'redirect' }, href),
  };
});

jest.mock('expo-navigation-bar', () => ({ setVisibilityAsync: jest.fn(() => Promise.resolve()) }));

jest.mock('react-native-edge-to-edge', () => ({ SystemBars: () => null }));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()), fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })) },
  useNetInfo: jest.fn(() => ({ isConnected: true, isInternetReachable: true })),
}));

// LiveKit (voice) has native modules: a small zustand stand-in with the fields the console reads.
jest.mock('@resgrid/voice', () => {
  const { create } = require('zustand');
  const mockLiveKitStore = create(() => ({
    isConnected: false,
    isTalking: false,
    currentRoomInfo: null as { Name: string } | null,
    ensureMicrophonePermission: jest.fn(async () => 'granted'),
    setIsBottomSheetVisible: jest.fn(),
  }));
  return { useLiveKitStore: mockLiveKitStore };
});

jest.mock('@resgrid/location', () => ({
  acquireLocationFix: jest.fn(async () => ({ outcome: 'ok', fix: { latitude: 39.1, longitude: -119.7, accuracy: 5, altitude: null, speed: null, heading: null, timestamp: 0 } })),
  getLocationFixErrorMessage: (outcome: string) => `location.${outcome}`,
}));

// Translations: keys come back verbatim (interpolation values appended) so tests assert on keys, not English text.
jest.mock('@resgrid/i18n', () => {
  const mockT = (key: string, options?: Record<string, unknown>) => {
    if (options && typeof options.defaultValue === 'string' && !key.includes('.')) return options.defaultValue;
    const values = options ? Object.entries(options).filter(([name]) => name !== 'defaultValue') : [];
    return values.length > 0 ? `${key}:${values.map(([, value]) => String(value)).join(',')}` : key;
  };
  return {
    useTranslation: () => ({ t: mockT, i18n: { language: 'en', exists: () => true } }),
    translate: mockT,
  };
});
