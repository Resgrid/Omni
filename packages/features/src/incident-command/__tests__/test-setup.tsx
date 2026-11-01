/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
// Incident-command test setup: the calls-cluster setup (gluestack, NativeWind, expo-router, i18n keys verbatim) plus
// stand-ins for the native-heavy packages this feature touches (MapLibre through @resgrid/maps, LiveKit through
// @resgrid/voice). Import it as the FIRST import of a test file.
import '../../calls/__tests__/test-setup';

jest.mock('@resgrid/maps', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  const passthrough =
    (name: string) =>
    ({ children, testID }: { children?: unknown; testID?: string }) =>
      mockReact.createElement(View, { testID: testID ?? `mock-${name}` }, children);
  return {
    MapView: passthrough('map-view'),
    Camera: () => null,
    MarkerView: passthrough('marker-view'),
    ShapeSource: passthrough('shape-source'),
    LineLayer: () => null,
    FillLayer: () => null,
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
