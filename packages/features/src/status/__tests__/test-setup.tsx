/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
// Shared Jest setup for the people & reference feature tests (status, roles, units, personnel, contacts, pois,
// weather-alerts, chat, notifications, data-protection). Import it as the FIRST import of a test file: the mocks
// register before @resgrid/ui (gluestack, NativeWind) loads. Mirrors packages/ui/jest.setup.tsx; the features jest
// config carries no package-local setup of its own.
import '@testing-library/react-native/extend-expect';

// react-aria (pulled in by gluestack) probes window.screen at import time; the RN test window has none.
const mockGlobalWindow = globalThis as unknown as { window?: { screen?: object } };
if (mockGlobalWindow.window && !mockGlobalWindow.window.screen) {
  mockGlobalWindow.window.screen = {};
}

// Reanimated 4's own mock loads react-native-worklets' native build, which needs the worklets Jest resolver the features
// config does not set; this stand-in covers what gluestack and these features touch.
jest.mock('react-native-worklets', () => ({ __esModule: true, scheduleOnRN: (fn: () => void) => fn(), runOnJS: (fn: unknown) => fn }));
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const passthrough = (value: unknown) => value;
  const animated = { View: RN.View, Text: RN.Text, Image: RN.Image, ScrollView: RN.ScrollView, FlatList: RN.FlatList, createAnimatedComponent: passthrough };
  // A callable proxy: gluestack chains layout animations (`FadeIn.duration(200).easing(...)`).
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

// The WebView stand-in exposes the generated (sanitized) document so tests can prove server HTML went through HtmlRenderer.
jest.mock('react-native-webview', () => {
  const mockReact = require('react');
  const { View, Text } = require('react-native');
  const MockWebView = ({ source, ...rest }: { source: { html?: string; uri?: string } }) =>
    mockReact.createElement(View, { testID: 'native-webview', ...rest }, mockReact.createElement(Text, { testID: 'webview-html' }, source.html ?? source.uri ?? ''));
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
  const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
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
