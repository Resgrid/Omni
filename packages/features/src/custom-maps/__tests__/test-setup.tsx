/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
// Jest setup for the custom/indoor maps screens. Import it FIRST: it pulls in the shared feature mocks (gluestack,
// NativeWind, expo-router, i18n keys verbatim) and replaces @resgrid/maps with host-view stand-ins (no MapLibre in Jest)
// that keep the package's pure helpers. `mockMapStyle.value` switches the map between the online and an offline style.
import '../../calls/__tests__/test-setup';

jest.mock('@resgrid/maps', () => {
  const mockReact = require('react');
  const { Pressable, Text, View } = require('react-native');
  const pixel = jest.requireActual('@resgrid/maps/lib/pixel-frame');
  const sources = jest.requireActual('@resgrid/maps/lib/offline-style-sources');
  const customMaps = jest.requireActual('@resgrid/maps/lib/custom-maps');
  const urls = jest.requireActual('@resgrid/maps/provider/url-safety');
  const mockMapStyle: { value: { mapStyle: unknown; isOffline: boolean } } = { value: { mapStyle: 'https://maps.example.org/day.json', isOffline: false } };
  return {
    __esModule: true,
    ...pixel,
    ...sources,
    ...customMaps,
    ...urls,
    mockMapStyle,
    useMapStyle: () => mockMapStyle.value,
    useMapServices: () => ({ getApiBaseUrl: () => 'https://api.example.org/api/v4' }),
    MapView: ({ children, testID }: { children?: unknown; testID?: string }) => mockReact.createElement(View, { testID }, children),
    Camera: (props: { centerCoordinate?: number[]; bounds?: { ne: number[]; sw: number[] }; zoomLevel?: number }) =>
      mockReact.createElement(
        Text,
        { testID: 'mock-camera' },
        props.centerCoordinate ? `center:${props.centerCoordinate.join(',')}@${props.zoomLevel ?? ''}` : props.bounds ? `bounds:${props.bounds.sw.join(',')}:${props.bounds.ne.join(',')}` : 'none'
      ),
    CustomMapRasterLayer: ({ layer, onRegionPress }: { layer: { IndoorMapFloorId: string; Regions?: { IndoorMapZoneId: string }[] }; onRegionPress?: (id: string) => void }) =>
      mockReact.createElement(
        View,
        { testID: `mock-custom-layer-${layer.IndoorMapFloorId}` },
        (layer.Regions ?? []).map((region) => mockReact.createElement(Pressable, { key: region.IndoorMapZoneId, testID: `mock-region-${region.IndoorMapZoneId}`, onPress: () => onRegionPress?.(region.IndoorMapZoneId) }))
      ),
    IndoorMapFloorLayer: ({ floor, onZonePress }: { floor: { IndoorMapFloorId: string; Zones?: { IndoorMapZoneId: string }[] }; onZonePress?: (id: string) => void }) =>
      mockReact.createElement(
        View,
        { testID: `mock-floor-layer-${floor.IndoorMapFloorId}` },
        (floor.Zones ?? []).map((zone) => mockReact.createElement(Pressable, { key: zone.IndoorMapZoneId, testID: `mock-zone-${zone.IndoorMapZoneId}`, onPress: () => onZonePress?.(zone.IndoorMapZoneId) }))
      ),
    PixelImageMap: ({ imageUrl, isLocalImage, regions, onRegionPress, testID }: { imageUrl: string | null; isLocalImage?: boolean; regions?: { id: string }[]; onRegionPress?: (id: string) => void; testID?: string }) =>
      mockReact.createElement(
        View,
        { testID: testID ?? 'mock-pixel-map', accessibilityLabel: `${isLocalImage ? 'local' : 'server'}:${imageUrl ?? ''}` },
        (regions ?? []).map((region) => mockReact.createElement(Pressable, { key: region.id, testID: `mock-pixel-region-${region.id}`, onPress: () => onRegionPress?.(region.id) }))
      ),
    MapLayersButton: ({ onPress, testID }: { onPress: () => void; testID?: string }) => mockReact.createElement(Pressable, { onPress, testID }),
    MapLayersSheet: ({ isOpen, layers, toggles, onToggle }: { isOpen: boolean; layers: { Id: string }[]; toggles: Record<string, boolean>; onToggle: (id: string) => void }) =>
      isOpen
        ? mockReact.createElement(
            View,
            { testID: 'mock-layers-sheet' },
            layers.map((layer) => mockReact.createElement(Pressable, { key: layer.Id, testID: `mock-toggle-${layer.Id}`, accessibilityState: { checked: toggles[layer.Id] === true }, onPress: () => onToggle(layer.Id) }))
          )
        : null,
  };
});
