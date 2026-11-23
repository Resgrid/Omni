import { useSecurity } from '@resgrid/auth';
import { useMapMarkersStore } from '@resgrid/data';
import { DepartmentLayers } from '@resgrid/features/map/components/department-layers';
import { FacilityMapsOverlay } from '@resgrid/features/map/components/facility-maps-overlay';
import { MapOverlayControls } from '@resgrid/features/map/components/map-layers-control';
import { useMapOverlays } from '@resgrid/features/map/hooks/use-map-overlays';
import { TRAFFIC_SURFACES, useTrafficPreference } from '@resgrid/features/map/hooks/use-traffic-preference';
import { useNavigationEtaPins } from '@resgrid/features/navigation-eta';
import { useTranslation } from '@resgrid/i18n';
import { Camera, type CameraRef, MapPins, MapTrafficButton, MapView, TrafficLayer, useMapCenter, useMapStyle } from '@resgrid/maps';
import type { MapMakerInfoData } from '@resgrid/models';
import { Text } from '@resgrid/ui';
import React, { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

export interface ConsoleMapProps {
  /** Centre on this point (the filtered call) instead of the department centre. */
  focus?: { latitude: number; longitude: number } | null;
  onPinPress?: (pin: MapMakerInfoData) => void;
  selectedPinId?: string | null;
}

const FOCUS_ZOOM = 14;
const DEFAULT_ZOOM = 11;

/**
 * The console's live map (MapLibre through @resgrid/maps): the department's pins (calls, units, personnel by the rights
 * DTO's CanViewPII, stations, POIs) from the persisted map-markers store, centred on the department or the filtered
 * call, with live traffic (on unless the dispatcher turned it off on this device; hidden when the server has none), the
 * department layers that are on (imported KML/KMZ/GeoJSON event layers included, as on the Map screen) and the facility
 * maps (custom and indoor maps) switched on — both from its Layers button, which shares the Map screen's session toggles.
 * A tapped room or region is named in a card. Style, attribution and offline packs come from the app's MapProvider;
 * without a configured style it says so.
 */
export const ConsoleMap: React.FC<ConsoleMapProps> = ({ focus = null, onPinPress, selectedPinId = null }) => {
  const { t } = useTranslation();
  const style = useMapStyle();
  const providerCenter = useMapCenter();
  const { canUserViewPII } = useSecurity();
  const markers = useMapMarkersStore((state) => state.markers);
  // Navigating units carry their live ETA under their label.
  const pins = useNavigationEtaPins(markers);
  const centerLatitude = useMapMarkersStore((state) => state.centerLatitude);
  const centerLongitude = useMapMarkersStore((state) => state.centerLongitude);
  const zoomLevel = useMapMarkersStore((state) => state.zoomLevel);
  const [isTrafficOn, toggleTraffic] = useTrafficPreference(TRAFFIC_SURFACES.dispatchConsole.id, TRAFFIC_SURFACES.dispatchConsole.defaultOn);
  const cameraRef = useRef<CameraRef>(null);
  const overlays = useMapOverlays(cameraRef);

  const camera = useMemo(() => {
    if (focus) return { centerCoordinate: [focus.longitude, focus.latitude] as [number, number], zoomLevel: FOCUS_ZOOM };

    if (centerLatitude !== null && centerLongitude !== null) return { centerCoordinate: [centerLongitude, centerLatitude] as [number, number], zoomLevel: zoomLevel ?? DEFAULT_ZOOM };

    return { centerCoordinate: [providerCenter.longitude, providerCenter.latitude] as [number, number], zoomLevel: providerCenter.zoomLevel || DEFAULT_ZOOM };
  }, [centerLatitude, centerLongitude, focus, providerCenter, zoomLevel]);

  if (!style.isAvailable && style.status !== 'loading') {
    return (
      <View style={styles.placeholder} className="bg-background-50" testID="console-map-unavailable">
        <Text className="text-center text-sm text-typography-500">{t('dispatch_console.map_unavailable')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView style={styles.map} compassEnabled testID="console-map">
        <Camera ref={cameraRef} defaultSettings={camera} centerCoordinate={camera.centerCoordinate} zoomLevel={camera.zoomLevel} animationMode="flyTo" animationDuration={600} />
        <FacilityMapsOverlay layers={overlays.facility.layers} selectedFeatureId={overlays.tappedFeature?.featureId ?? null} onFeaturePress={overlays.setTappedFeature} />
        <TrafficLayer visible={isTrafficOn} idPrefix="console-traffic" />
        <DepartmentLayers layers={overlays.departmentLayers} enabled={overlays.enabled} layerIdPrefix="console-layer" offlineIdPrefix="console-offline-layers" />
        <MapPins pins={pins} onPinPress={onPinPress} selectedPinId={selectedPinId} canViewPersonnel={canUserViewPII} idPrefix="console-pins" />
      </MapView>
      <MapTrafficButton isOn={isTrafficOn} side="left" bottomOffset={12} onPress={toggleTraffic} testID="console-map-traffic-button" />
      <MapOverlayControls overlays={overlays} side="right" bottomOffset={12} testID="console-map" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 200 },
  map: { flex: 1, minHeight: 200 },
  placeholder: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
