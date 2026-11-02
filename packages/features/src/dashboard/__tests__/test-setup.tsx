/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
// Jest setup for the dashboard tests. Import it as the FIRST import of a test file: the mocks register before
// @resgrid/ui (gluestack, NativeWind) loads. Self-contained (mirrors status/__tests__/test-setup) because the dashboard
// also needs Gesture Handler, a Reanimated stand-in with `.get()`/`.set()`, worklets' `scheduleOnRN` with arguments, and
// @resgrid/maps (MapLibre has no Jest renderer).
import '@testing-library/react-native/extend-expect';

const mockGlobalWindow = globalThis as unknown as { window?: { screen?: object } };
if (mockGlobalWindow.window && !mockGlobalWindow.window.screen) {
  mockGlobalWindow.window.screen = {};
}

jest.mock('react-native-worklets', () => ({
  __esModule: true,
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
  runOnJS: (fn: unknown) => fn,
}));

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const passthrough = (value: unknown) => value;
  const animated = { View: RN.View, Text: RN.Text, Image: RN.Image, ScrollView: RN.ScrollView, FlatList: RN.FlatList, createAnimatedComponent: passthrough };
  const layoutAnimation: unknown = new Proxy(function mockLayoutAnimation() {}, { get: () => layoutAnimation, apply: () => layoutAnimation });
  const sharedValue = (initial: unknown) => {
    const box = { value: initial, get: () => box.value, set: (next: unknown) => (box.value = typeof next === 'function' ? (next as (mockPrevious: unknown) => unknown)(box.value) : next) };
    return box;
  };
  return {
    __esModule: true,
    default: animated,
    ...animated,
    useSharedValue: (value: unknown) => require('react').useRef(sharedValue(value)).current,
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => unknown) => ({ value: fn(), get: fn }),
    useAnimatedProps: () => ({}),
    useAnimatedReaction: () => undefined,
    useReducedMotion: () => false,
    withTiming: passthrough,
    withSpring: passthrough,
    withRepeat: passthrough,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withDelay: (_delay: number, value: unknown) => value,
    cancelAnimation: () => undefined,
    runOnJS: (fn: unknown) => fn,
    interpolate: () => 0,
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
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
    Layout: layoutAnimation,
    LinearTransition: layoutAnimation,
  };
});

// Gestures never fire in Jest: the builder records nothing and the detector renders its child. Drag maths is covered by
// the pure grid tests and the store tests.
jest.mock('react-native-gesture-handler', () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const name of ['enabled', 'minDistance', 'requireExternalGestureToFail', 'blocksExternalGesture', 'onBegin', 'onStart', 'onUpdate', 'onEnd', 'onFinalize', 'runOnJS']) builder[name] = chain;
  return {
    __esModule: true,
    Gesture: { Pan: () => builder },
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: ({ children }: { children: unknown }) => children,
  };
});

jest.mock('@resgrid/maps', () => {
  const mockReact = require('react');
  const { View, Text } = require('react-native');
  const context = { hasProvider: false, center: { latitude: 39.1, longitude: -119.7, zoomLevel: 9 }, style: { status: 'ready', isAvailable: true } };
  return {
    __esModule: true,
    mockMapContext: context,
    useMapProviderContext: () => context,
    MapProvider: ({ children }: { children: unknown }) => mockReact.createElement(View, { testID: 'mock-map-provider' }, children),
    MapView: ({ children, testID }: { children: unknown; testID?: string }) => mockReact.createElement(View, { testID }, children),
    Camera: mockReact.forwardRef(() => null),
    MapPins: ({ pins }: { pins: { Id: string }[] }) => mockReact.createElement(Text, { testID: 'mock-map-pins' }, pins.map((pin) => pin.Id).join(',')),
    useFitBounds: () => () => true,
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
  const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    useIsFocused: jest.fn(() => true),
    router: mockRouter,
    useRouter: () => mockRouter,
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: jest.fn(),
  };
});

jest.mock('expo-navigation-bar', () => ({ setVisibilityAsync: jest.fn(() => Promise.resolve()) }));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

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
