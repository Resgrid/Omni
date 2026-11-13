/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
// Jest setup for the navigation screen tests. Import it FIRST: it pulls in the shared feature mocks (gluestack,
// NativeWind, expo-router, i18n keys verbatim) and replaces @resgrid/maps with host-view stand-ins (no MapLibre in Jest),
// @resgrid/location with a settable position feed, expo-speech and expo-keep-awake with no-ops, and the in-app navigation
// availability with a switch (`mockNavigationAvailability.value`).
import '../../calls/__tests__/test-setup';

jest.mock('@resgrid/location', () => {
  const mockListeners = new Set<(mockLocation: unknown) => void>();
  return {
    mockLocationFeed: { emit: (mockLocation: unknown) => mockListeners.forEach((mockListener) => mockListener(mockLocation)) },
    subscribeCurrentLocation: (mockListener: (mockLocation: unknown) => void) => {
      mockListeners.add(mockListener);
      return () => mockListeners.delete(mockListener);
    },
    getCurrentLocation: jest.fn(() => null),
    getLocationTransmitter: jest.fn(() => null),
    acquireLocationFix: jest.fn(async () => ({ outcome: 'ok', location: null })),
    getLocationFixErrorMessage: (outcome: string) => `location.${outcome}`,
  };
});

jest.mock('@resgrid/maps', () => {
  const mockReact = require('react');
  const { Text, View } = require('react-native');
  const passthrough = ({ children, testID }: { children?: unknown; testID?: string }) => mockReact.createElement(View, { testID }, children);
  return {
    __esModule: true,
    MapView: passthrough,
    Camera: () => null,
    ShapeSource: passthrough,
    CircleLayer: () => null,
    LineLayer: () => null,
    RouteLine: ({ line }: { line: unknown[] | null }) => mockReact.createElement(Text, { testID: 'mock-route-line' }, String(line?.length ?? 0)),
    UnitLocationMarker: () => mockReact.createElement(Text, { testID: 'mock-vehicle' }, 'vehicle'),
    TrafficLayer: () => mockReact.createElement(Text, { testID: 'mock-traffic' }, 'traffic'),
    useMapTraffic: () => ({ available: true, tileUrl: 'https://api.test/traffic/{z}/{x}/{y}.pbf', type: 'vector', refreshSeconds: 300 }),
    useMapRouting: () => ({ provider: 'valhalla', supportsTraffic: false, supportsIncidents: false, supportsVoice: true, navigationAvailable: true }),
  };
});

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn(), activateKeepAwakeAsync: jest.fn(), deactivateKeepAwake: jest.fn() }));

jest.mock('../hooks/use-in-app-navigation', () => {
  const mockNavigationAvailability = { value: true };
  return { mockNavigationAvailability, useInAppNavigationAvailable: () => mockNavigationAvailability.value };
});
