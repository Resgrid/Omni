/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
// Incident-command test setup: the calls-cluster setup (gluestack, NativeWind, expo-router, i18n keys verbatim) plus
// stand-ins for the native-heavy packages this feature touches (MapLibre through @resgrid/maps, LiveKit through
// @resgrid/voice). Import it as the FIRST import of a test file.
import '../../calls/__tests__/test-setup';

jest.mock('@resgrid/maps', () => {
  const mockReact = require('react');
  const { Pressable, Text, View } = require('react-native');

  const passthrough =
    (name: string) =>
    ({ children, testID }: { children?: unknown; testID?: string }) =>
      mockReact.createElement(View, { testID: testID ?? `mock-${name}` }, children);

  // `mockMapCapabilities.layers` turns the department layers and facility maps on (off by default: nothing to load).
  const mockMapCapabilities = { layers: false, customIndoor: true, navigationInApp: false };

  return {
    ...jest.requireActual('@resgrid/maps/lib/pixel-frame'),
    isSafeMapUrl: jest.requireActual('@resgrid/maps/provider/url-safety').isSafeMapUrl,
    mockMapCapabilities,
    useMapCapabilities: () => mockMapCapabilities,
    MapView: passthrough('map-view'),
    Camera: () => null,
    MarkerView: passthrough('marker-view'),
    ShapeSource: passthrough('shape-source'),
    LineLayer: () => null,
    FillLayer: () => null,
    GeoJsonMapLayer: ({ id }: { id: string }) => mockReact.createElement(View, { testID: `mock-${id}` }),
    OfflineDepartmentLayers: () => null,
    CustomMapRasterLayer: ({ layer }: { layer: { IndoorMapFloorId: string } }) => mockReact.createElement(View, { testID: `mock-custom-map-${layer.IndoorMapFloorId}` }),
    IndoorMapFloorLayer: ({ floor }: { floor: { IndoorMapFloorId: string } }) => mockReact.createElement(View, { testID: `mock-indoor-floor-${floor.IndoorMapFloorId}` }),
    MapLayersButton: ({ onPress, testID }: { onPress: () => void; testID?: string }) => mockReact.createElement(Pressable, { onPress, testID }),
    MapLayersSheet: ({ isOpen, facilityMaps }: { isOpen: boolean; facilityMaps?: { items: { Id: string; Name: string }[] } }) =>
      isOpen ? mockReact.createElement(Text, { testID: 'mock-layers-sheet' }, (facilityMaps?.items ?? []).map((item) => item.Name).join(',')) : null,
  };
});

jest.mock('@resgrid/voice', () => {
  const mockPtt = {
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    isTransmitting: false,
    canTransmit: false,
    currentChannel: null,
    error: null,
    connect: jest.fn(async () => ({ ok: true })),
    disconnect: jest.fn(async () => undefined),
    startTransmitting: jest.fn(async () => undefined),
    stopTransmitting: jest.fn(async () => undefined),
    toggleTransmitting: jest.fn(async () => undefined),
    reconnect: jest.fn(async () => ({ ok: true })),
    clearError: jest.fn(),
  };

  return {
    mockPtt,
    useVoiceChannels: jest.fn(() => ({
      channels: [],
      selectedChannel: null,
      defaultChannel: null,
      isVoiceEnabled: false,
      isLoading: false,
      error: null,
      refresh: jest.fn(async () => ({ ok: true })),
      selectChannel: jest.fn(),
    })),
    usePtt: jest.fn(() => mockPtt),
    useLiveKitStore: { getState: () => ({ availableRooms: [] }) },
  };
});
