import { useCustomMapsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { buildIndoorFloorImageUrl, Camera, IndoorMapFloorLayer, MapView, offlineFloorSourceId, PixelImageMap, styleImageSourceUrl, useMapServices, useMapStyle } from '@resgrid/maps';
import type { IndoorMapFloorResultData } from '@resgrid/models';
import { HStack, Loading, Pressable, ScreenHeader, ScrollRow, Text, View, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Building2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { FeatureDetailCard } from '../components/feature-detail-card';
import { floorViewMode, mapBounds, sortByOrder, toPixelRegions, usableCenter } from '../lib/map-viewer';
import { customMapsRoutes, readMapParam } from '../routes';

const CAMERA_PADDING = { paddingTop: 40, paddingRight: 40, paddingBottom: 40, paddingLeft: 40 };

/** A pixel-only floor image: the downloaded copy offline when the pack has it, else the server image (signed by the viewer). */
const usePixelFloorImage = (floorId: string | null): { url: string | null; isLocal: boolean; missingOffline: boolean } => {
  const { mapStyle, isOffline } = useMapStyle();
  const services = useMapServices();
  return useMemo(() => {
    if (!floorId) return { url: null, isLocal: false, missingOffline: false };
    const local = isOffline ? styleImageSourceUrl(mapStyle, offlineFloorSourceId(floorId)) : null;
    if (local) return { url: local, isLocal: true, missingOffline: false };
    return { url: buildIndoorFloorImageUrl(services.getApiBaseUrl(), floorId), isLocal: false, missingOffline: isOffline };
  }, [floorId, isOffline, mapStyle, services]);
};

/**
 * An indoor map (`/maps/indoor/[id]`, Unit/IC `app/maps/indoor/[id]`): a floor picker, the floor image over its bounds on
 * the department map with its zones (offline from the downloaded floor image), or — MapLibre plan D21 — a floor with no
 * geographic bounds in the pixel-space viewer with its zones. `?floorId=` opens a floor, `?featureId=` selects a zone.
 */
export default function IndoorMapScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[]; floorId?: string | string[]; featureId?: string | string[] }>();
  const mapId = readMapParam(params.id);
  const requestedFloorId = readMapParam(params.floorId);
  const requestedFeatureId = readMapParam(params.featureId);
  const data = useCustomMapsStore((state) => (mapId ? state.indoorMapById[mapId] : undefined));
  const floorById = useCustomMapsStore((state) => state.floorById);
  const isLoading = useCustomMapsStore((state) => state.loading.indoorMap === true);
  const hasError = useCustomMapsStore((state) => !!state.errors.indoorMap);
  const [chosenFloorId, setChosenFloorId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(requestedFeatureId);

  useEffect(() => {
    if (mapId) void useCustomMapsStore.getState().fetchIndoorMap(mapId);
  }, [mapId]);

  const floors = useMemo(() => sortByOrder(data?.Floors ?? []), [data?.Floors]);
  const floorId = chosenFloorId ?? (requestedFloorId && floors.some((f) => f.IndoorMapFloorId === requestedFloorId) ? requestedFloorId : null) ?? data?.Map.DefaultFloorId ?? floors[0]?.IndoorMapFloorId ?? null;

  // The floor's own read carries its zones; the map's floor list is the fallback (offline, or before it loads).
  useEffect(() => {
    if (floorId) void useCustomMapsStore.getState().fetchIndoorFloor(floorId);
  }, [floorId]);
  const floor: IndoorMapFloorResultData | null = (floorId ? (floorById[floorId] ?? floors.find((f) => f.IndoorMapFloorId === floorId)) : null) ?? null;
  const mode = floor ? floorViewMode(floor) : 'none';
  const image = usePixelFloorImage(floor && mode === 'pixel' ? floor.IndoorMapFloorId : null);
  const selectedZone = floor?.Zones?.find((zone) => zone.IndoorMapZoneId === selectedZoneId) ?? null;

  const back = () => (router.canGoBack() ? router.back() : router.replace(customMapsRoutes.home()));
  const title = data?.Map.Name ?? t('maps.indoor_maps');

  if (!data) {
    return (
      <View className="flex-1 bg-background-50" testID="indoor-map-screen">
        <ScreenHeader title={title} onBack={back} />
        {hasError && !isLoading ? <ZeroState icon={Building2} isError heading={t('maps.error_loading')} testID="indoor-map-error" /> : <Loading text={t('maps.loading')} />}
      </View>
    );
  }

  const bounds = floor ? (mapBounds(floor) ?? mapBounds(data.Map)) : mapBounds(data.Map);
  const focus = selectedZone && requestedFeatureId === selectedZone.IndoorMapZoneId ? usableCenter(selectedZone.CenterLatitude, selectedZone.CenterLongitude) : null;
  const center = usableCenter(data.Map.CenterLatitude, data.Map.CenterLongitude);

  return (
    <View className="flex-1 bg-background-50" testID="indoor-map-screen">
      <ScreenHeader title={title} onBack={back} />
      {floors.length > 1 ? (
        <ScrollRow contentContainerStyle={styles.floors} testID="indoor-map-floors">
          <HStack space="sm">
            {floors.map((item) => (
              <Pressable
                key={item.IndoorMapFloorId}
                onPress={() => {
                  setSelectedZoneId(null);
                  setChosenFloorId(item.IndoorMapFloorId);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: item.IndoorMapFloorId === floorId }}
                className={`rounded-full border px-3 py-1 ${item.IndoorMapFloorId === floorId ? 'border-primary-500 bg-primary-50' : 'border-outline-200 bg-background-0'}`}
                testID={`indoor-floor-${item.IndoorMapFloorId}`}
              >
                <Text className={item.IndoorMapFloorId === floorId ? 'text-primary-700' : 'text-typography-700'}>{item.Name}</Text>
              </Pressable>
            ))}
          </HStack>
        </ScrollRow>
      ) : null}
      <View style={styles.map}>
        {!floor || mode === 'none' ? (
          <ZeroState icon={Building2} heading={t('custom_maps.nothing_to_show')} description={t('custom_maps.nothing_to_show_detail')} testID="indoor-map-nothing" />
        ) : mode === 'pixel' ? (
          <PixelImageMap
            id={`indoor-pixel-${floor.IndoorMapFloorId}`}
            imageUrl={image.url}
            isLocalImage={image.isLocal}
            regions={toPixelRegions(floor.Zones ?? [])}
            opacity={floor.Opacity}
            selectedRegionId={selectedZoneId}
            onRegionPress={setSelectedZoneId}
            testID="indoor-map-pixel"
          />
        ) : (
          <MapView style={styles.map} testID="indoor-map-map">
            {focus ? (
              <Camera centerCoordinate={focus} zoomLevel={19} animationMode="none" />
            ) : bounds ? (
              <Camera bounds={{ ...bounds, ...CAMERA_PADDING }} animationMode="none" />
            ) : center ? (
              <Camera centerCoordinate={center} zoomLevel={18} animationMode="none" />
            ) : null}
            <IndoorMapFloorLayer floor={floor} onZonePress={setSelectedZoneId} selectedZoneId={selectedZoneId} />
          </MapView>
        )}
        {mode === 'pixel' && image.missingOffline ? (
          <View style={styles.notice} className="bg-warning-100" testID="indoor-map-image-offline">
            <Text className="text-sm text-warning-800">{t('custom_maps.image_not_offline')}</Text>
          </View>
        ) : null}
        {selectedZone ? <FeatureDetailCard name={selectedZone.Name} description={selectedZone.Description} kindKey="maps.zone" onClose={() => setSelectedZoneId(null)} testID="indoor-map-zone" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floors: { paddingHorizontal: 16, paddingVertical: 8 },
  map: { flex: 1 },
  notice: { borderRadius: 8, left: 12, padding: 8, position: 'absolute', right: 12, top: 12 },
});
