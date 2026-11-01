import { useSecurity } from '@resgrid/auth';
import { useMapMarkersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Camera, MapPins, MapView, useMapCenter, useMapStyle } from '@resgrid/maps';
import type { MapMakerInfoData } from '@resgrid/models';
import { Text } from '@resgrid/ui';
import React, { useMemo } from 'react';
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
 * call. Style, attribution and offline packs come from the app's MapProvider; without a configured style it says so.
 */
export const ConsoleMap: React.FC<ConsoleMapProps> = ({ focus = null, onPinPress, selectedPinId = null }) => {
  const { t } = useTranslation();
  const style = useMapStyle();
  const providerCenter = useMapCenter();
  const { canUserViewPII } = useSecurity();
  const markers = useMapMarkersStore((state) => state.markers);
  const centerLatitude = useMapMarkersStore((state) => state.centerLatitude);
  const centerLongitude = useMapMarkersStore((state) => state.centerLongitude);
  const zoomLevel = useMapMarkersStore((state) => state.zoomLevel);

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
    <MapView style={styles.map} compassEnabled testID="console-map">
      <Camera defaultSettings={camera} centerCoordinate={camera.centerCoordinate} zoomLevel={camera.zoomLevel} animationMode="flyTo" animationDuration={600} />
      <MapPins pins={markers} onPinPress={onPinPress} selectedPinId={selectedPinId} canViewPersonnel={canUserViewPII} idPrefix="console-pins" />
    </MapView>
  );
};

const styles = StyleSheet.create({
  map: { flex: 1, minHeight: 200 },
  placeholder: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
