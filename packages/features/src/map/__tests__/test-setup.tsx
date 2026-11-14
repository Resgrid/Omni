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

  // `mockMapView.queryRenderedFeatures` answers the screen's rendered-feature lookups; `mockMapStyle.isOffline` switches
  // the style the screen sees to the offline one.
  const mockMapView = { queryRenderedFeatures: jest.fn(async (): Promise<GeoJSON.Feature[]> => []) };
  const mockMapStyle = { isOffline: false };

  return {
    __esModule: true,
    ...pinIds,
    ...poi,
    mockCamera,
    mockMapView,
    mockMapStyle,
    // React 19 hands a function component its `ref` as a prop.
    MapView: ({
      ref,
      children,
      testID,
      onCameraChanged,
      onPress,
      scrollEnabled,
      zoomEnabled,
      rotateEnabled,
      pitchEnabled,
    }: {
      ref?: { current: typeof mockMapView | null } | null;
      children?: unknown;
      testID?: string;
      onCameraChanged?: unknown;
      onPress?: (event: { point: [number, number] }) => void;
      scrollEnabled?: boolean;
      zoomEnabled?: boolean;
      rotateEnabled?: boolean;
      pitchEnabled?: boolean;
    }) => {
      mockReact.useImperativeHandle(ref, () => mockMapView);

      return mockReact.createElement(View, { testID, onCameraChanged, onPress, scrollEnabled, zoomEnabled, rotateEnabled, pitchEnabled }, children);
    },
    offlineDepartmentLayerIds: (idPrefix: string) => [`${idPrefix}-labels`, `${idPrefix}-points`, `${idPrefix}-line`, `${idPrefix}-fill`],
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
    // `mock-<id>-press` taps every shape of the layer at once (as a tap over overlapping shapes reports them).
    GeoJsonMapLayer: ({ id, data, onFeaturePress }: { id: string; data?: { features: { type: string }[] } | null; onFeaturePress?: (feature: { type: string }, features: { type: string }[]) => void }) =>
      mockReact.createElement(
        View,
        { testID: `mock-${id}` },
        onFeaturePress && data?.features[0] ? mockReact.createElement(Pressable, { testID: `mock-${id}-press`, onPress: () => onFeaturePress(data.features[0], data.features) }) : null
      ),
    OfflineDepartmentLayers: ({ visibleLayerIds, excludeLayerIds, idPrefix }: { visibleLayerIds?: string[] | null; excludeLayerIds?: string[]; idPrefix?: string }) =>
      mockReact.createElement(Text, { testID: `mock-${idPrefix ?? 'offline-dept-layers'}` }, JSON.stringify({ visible: visibleLayerIds ?? null, exclude: excludeLayerIds ?? [] })),
    ShapeSource: ({ id, shape, children }: { id: string; shape?: { features?: unknown[] }; children?: unknown }) =>
      mockReact.createElement(View, { testID: `mock-source-${id}`, accessibilityLabel: String(shape?.features?.length ?? 0) }, children),
    CircleLayer: () => null,
    FillLayer: () => null,
    LineLayer: () => null,
    SymbolLayer: () => null,
    TrafficLayer: ({ visible = true, idPrefix }: { visible?: boolean; idPrefix?: string }) =>
      mockReact.createElement(View, { testID: `mock-traffic-${idPrefix ?? 'rg-traffic'}`, accessibilityLabel: visible ? 'visible' : 'hidden' }),
    MapTrafficButton: ({ isOn, onPress, testID, side = 'right', bottomOffset = 20 }: { isOn: boolean; onPress: () => void; testID?: string; side?: string; bottomOffset?: number }) =>
      mockReact.createElement(Pressable, { onPress, testID: testID ?? 'map-traffic-button', accessibilityHint: `${side}:${bottomOffset}`, accessibilityState: { selected: isOn } }),
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
      onShowDetails,
      onBrowseMaps,
    }: {
      isOpen: boolean;
      layers: { Id: string; Name: string; Detail?: string | null; Badge?: { label: string; tone: string } | null; HasDetails?: boolean }[];
      toggles: Record<string, boolean>;
      onToggle: (id: string) => void;
      onShowDetails?: (id: string) => void;
      onBrowseMaps?: () => void;
    }) =>
      isOpen
        ? mockReact.createElement(
            View,
            { testID: 'mock-layers-sheet' },
            layers.map((layer) =>
              mockReact.createElement(
                View,
                { key: layer.Id },
                mockReact.createElement(Pressable, { testID: `layer-toggle-${layer.Id}`, onPress: () => onToggle(layer.Id) }, mockReact.createElement(Text, null, `${layer.Name}:${toggles[layer.Id] ? 'on' : 'off'}`)),
                layer.Badge ? mockReact.createElement(Text, { testID: `layer-badge-${layer.Id}` }, `${layer.Badge.label}|${layer.Badge.tone}`) : null,
                layer.Detail ? mockReact.createElement(Text, { testID: `layer-detail-${layer.Id}` }, layer.Detail) : null,
                layer.HasDetails && onShowDetails ? mockReact.createElement(Pressable, { testID: `layer-details-${layer.Id}`, onPress: () => onShowDetails(layer.Id) }) : null
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
    useMapStyle: () => ({ status: 'ready', isAvailable: true, kind: 'maplibre', isOffline: mockMapStyle.isOffline }),
  };
});
