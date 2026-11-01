/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
// Jest setup for the map feature tests. Import it FIRST, as a side-effect import (`import './test-setup'`): it pulls in
// the shared feature mocks (gluestack, NativeWind, expo-router, i18n keys verbatim) and replaces @resgrid/maps with
// host-view stand-ins (no MapLibre in Jest) that keep the package's pure pin helpers, and @resgrid/location with a
// settable current fix (`jest.requireMock('@resgrid/location').mockCurrentLocation.value = fix`).
import '../../calls/__tests__/test-setup';

jest.mock('@resgrid/location', () => {
  const mockCurrentLocation: { value: unknown } = { value: null };
  return {
    mockCurrentLocation,
    useCurrentLocation: () => mockCurrentLocation.value,
    acquireLocationFix: jest.fn(async () => ({ outcome: 'ok', location: null })),
    getLocationFixErrorMessage: (outcome: string) => `location.${outcome}`,
  };
});

jest.mock('@resgrid/maps', () => {
  const mockReact = require('react');
  const { Pressable, Text, View } = require('react-native');
  const pinIds = jest.requireActual('@resgrid/maps/lib/pin-ids');
  const poi = jest.requireActual('@resgrid/maps/lib/poi');
  const mockCamera = { setCamera: jest.fn(), flyTo: jest.fn(), moveTo: jest.fn(), zoomTo: jest.fn(), fitBounds: jest.fn() };
  const theme = {
    background: '#ffffff',
    surface: '#f3f4f6',
    text: '#111827',
    mutedText: '#4b5563',
    border: '#e5e7eb',
    primary: '#3b82f6',
    onPrimary: '#ffffff',
    danger: '#dc2626',
    overlay: '#000000',
    onOverlay: '#ffffff',
  };
  const control =
    (fallbackTestID: string) =>
    ({ onPress, testID, side = 'right', bottomOffset = 20 }: { onPress: () => void; testID?: string; side?: string; bottomOffset?: number }) =>
      mockReact.createElement(Pressable, { onPress, testID: testID ?? fallbackTestID, accessibilityHint: `${side}:${bottomOffset}` });
  return {
    __esModule: true,
    ...pinIds,
    ...poi,
    mockCamera,
    MapView: ({ children, testID, onCameraChanged }: { children?: unknown; testID?: string; onCameraChanged?: unknown }) => mockReact.createElement(View, { testID, onCameraChanged }, children),
    Camera: mockReact.forwardRef(({ defaultSettings }: { defaultSettings?: { centerCoordinate?: number[]; zoomLevel?: number } }, ref: unknown) => {
      mockReact.useImperativeHandle(ref, () => mockCamera);
      return mockReact.createElement(Text, { testID: 'mock-camera' }, `${defaultSettings?.centerCoordinate?.join(',') ?? ''}@${defaultSettings?.zoomLevel ?? ''}`);
    }),
    MapPins: ({ pins, onPinPress, selectedPinId, canViewPersonnel }: { pins: { Id: string }[]; onPinPress?: (pin: unknown) => void; selectedPinId?: string | null; canViewPersonnel: boolean }) =>
      mockReact.createElement(
        View,
        { testID: 'mock-map-pins', accessibilityLabel: `selected:${selectedPinId ?? ''}|pii:${String(canViewPersonnel)}` },
        pins.map((pin) => mockReact.createElement(Pressable, { key: pin.Id, testID: `pin-${pin.Id}`, onPress: () => onPinPress?.(pin) }))
      ),
    UnitLocationMarker: ({ latitude, longitude }: { latitude: number; longitude: number }) => mockReact.createElement(Text, { testID: 'mock-own-location' }, `${latitude},${longitude}`),
    GeoJsonMapLayer: ({ id }: { id: string }) => mockReact.createElement(View, { testID: `mock-${id}` }),
    ShapeSource: ({ id, shape, children }: { id: string; shape?: { features?: unknown[] }; children?: unknown }) =>
      mockReact.createElement(View, { testID: `mock-source-${id}`, accessibilityLabel: String(shape?.features?.length ?? 0) }, children),
    CircleLayer: () => null,
    MapFocusBanner: ({ title, detail, onRecenter }: { title: string; detail?: string | null; onRecenter?: () => void }) =>
      mockReact.createElement(
        View,
        { testID: 'mock-focus-banner' },
        mockReact.createElement(Text, { testID: 'mock-focus-title' }, title),
        detail ? mockReact.createElement(Text, { testID: 'mock-focus-detail' }, detail) : null,
        onRecenter ? mockReact.createElement(Pressable, { testID: 'mock-focus-recenter', onPress: onRecenter }) : null
      ),
    MapLayersButton: control('map-layers-button'),
    MapLegendButton: control('map-legend-button'),
    MapRecenterButton: control('map-recenter-button'),
    MapLayersSheet: ({
      isOpen,
      layers,
      toggles,
      onToggle,
      onBrowseMaps,
    }: {
      isOpen: boolean;
      layers: { Id: string; Name: string }[];
      toggles: Record<string, boolean>;
      onToggle: (id: string) => void;
      onBrowseMaps?: () => void;
    }) =>
      isOpen
        ? mockReact.createElement(
            View,
            { testID: 'mock-layers-sheet' },
            layers.map((layer) =>
              mockReact.createElement(
                Pressable,
                { key: layer.Id, testID: `layer-toggle-${layer.Id}`, onPress: () => onToggle(layer.Id) },
                mockReact.createElement(Text, null, `${layer.Name}:${toggles[layer.Id] ? 'on' : 'off'}`)
              )
            ),
            onBrowseMaps ? mockReact.createElement(Pressable, { testID: 'layers-browse-maps', onPress: onBrowseMaps }) : null
          )
        : null,
    MapLegendSheet: ({ isOpen, canViewPersonnel, terms }: { isOpen: boolean; canViewPersonnel: boolean; terms?: { calls?: string } }) =>
      isOpen ? mockReact.createElement(Text, { testID: 'mock-legend-sheet' }, `pii:${String(canViewPersonnel)}|${terms?.calls ?? ''}`) : null,
    useFollowCamera: jest.fn(),
    useMapCenter: () => ({ latitude: 39.1, longitude: -119.7, zoomLevel: 9 }),
    useMapTheme: () => ({ colors: theme, isDark: false, scheme: 'light' }),
    useMapStyle: () => ({ status: 'ready', isAvailable: true, kind: 'maplibre' }),
  };
});
