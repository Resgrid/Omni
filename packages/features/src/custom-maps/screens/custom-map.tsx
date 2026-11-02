import { useCustomMapsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import {
  buildCustomMapLayerImageUrl,
  Camera,
  CustomMapRasterLayer,
  MapLayersButton,
  MapLayersSheet,
  type MapLayerToggleItem,
  MapView,
  offlineFloorSourceId,
  PixelImageMap,
  styleImageSourceUrl,
  useMapServices,
  useMapStyle,
} from '@resgrid/maps';
import type { CustomMapLayerResultData } from '@resgrid/models';
import { Loading, ScreenHeader, Text, View, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Map as MapIcon } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { FeatureDetailCard } from '../components/feature-detail-card';
import { layerViewMode, mapBounds, sortByOrder, toPixelRegions, usableCenter } from '../lib/map-viewer';
import { customMapsRoutes, readMapParam } from '../routes';

const CAMERA_PADDING = { paddingTop: 40, paddingRight: 40, paddingBottom: 40, paddingLeft: 40 };

/** The image of a pixel-only layer: the downloaded copy offline when the pack has it, else the server image (signed by the viewer). */
export const usePixelLayerImage = (layerId: string | null): { url: string | null; isLocal: boolean; missingOffline: boolean } => {
  const { mapStyle, isOffline } = useMapStyle();
  const services = useMapServices();
  return useMemo(() => {
    if (!layerId) return { url: null, isLocal: false, missingOffline: false };
    const local = isOffline ? styleImageSourceUrl(mapStyle, offlineFloorSourceId(layerId)) : null;
    if (local) return { url: local, isLocal: true, missingOffline: false };
    return { url: buildCustomMapLayerImageUrl(services.getApiBaseUrl(), layerId), isLocal: false, missingOffline: isOffline };
  }, [isOffline, layerId, mapStyle, services]);
};

/**
 * A custom map (`/maps/custom/[id]`, Unit/IC `app/maps/custom/[id]`): its georeferenced layers on the department map
 * (signed Mercator tiles or the layer image over its bounds, offline from the downloaded packs) with their regions, and —
 * MapLibre plan D21 — a layer that has no geographic bounds in the pixel-space viewer with its regions. `?layerId=` opens a
 * layer, `?featureId=` selects a region (search results).
 */
export default function CustomMapScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[]; layerId?: string | string[]; featureId?: string | string[] }>();
  const mapId = readMapParam(params.id);
  const requestedLayerId = readMapParam(params.layerId);
  const requestedFeatureId = readMapParam(params.featureId);
  const data = useCustomMapsStore((state) => (mapId ? state.customMapById[mapId] : undefined));
  const isLoading = useCustomMapsStore((state) => state.loading.customMap === true);
  const hasError = useCustomMapsStore((state) => !!state.errors.customMap);

  useEffect(() => {
    if (mapId) void useCustomMapsStore.getState().fetchCustomMap(mapId);
  }, [mapId]);

  const layers = useMemo(() => sortByOrder(data?.Layers ?? []), [data?.Layers]);
  const geoLayers = useMemo(() => layers.filter((layer) => layerViewMode(layer) === 'geo'), [layers]);
  const pixelLayers = useMemo(() => layers.filter((layer) => layerViewMode(layer) === 'pixel'), [layers]);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [pixelLayerId, setPixelLayerId] = useState<string | null>(null);
  const [pixelChosen, setPixelChosen] = useState(false);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(requestedFeatureId);
  const [layersOpen, setLayersOpen] = useState(false);

  // The pixel viewer opens for a requested pixel-only layer, or when the map has nothing georeferenced to show.
  const activePixelLayerId = pixelChosen
    ? pixelLayerId
    : requestedLayerId && pixelLayers.some((layer) => layer.IndoorMapFloorId === requestedLayerId)
      ? requestedLayerId
      : geoLayers.length === 0
        ? (pixelLayers[0]?.IndoorMapFloorId ?? null)
        : null;
  const pixelLayer = pixelLayers.find((layer) => layer.IndoorMapFloorId === activePixelLayerId) ?? null;
  const visibleGeoLayers = geoLayers.filter((layer) => hidden[layer.IndoorMapFloorId] !== true);
  const image = usePixelLayerImage(pixelLayer?.IndoorMapFloorId ?? null);

  const regionLayers: CustomMapLayerResultData[] = pixelLayer ? [pixelLayer] : visibleGeoLayers;
  const selectedRegion = regionLayers.flatMap((layer) => layer.Regions ?? []).find((region) => region.IndoorMapZoneId === selectedRegionId) ?? null;

  const toggleItems: MapLayerToggleItem[] = [...geoLayers, ...pixelLayers].map((layer) => ({ Id: layer.IndoorMapFloorId, Name: layer.Name }));
  const inPixelView = pixelLayer !== null;
  const toggles: Record<string, boolean> = Object.fromEntries([
    ...geoLayers.map((layer) => [layer.IndoorMapFloorId, !inPixelView && hidden[layer.IndoorMapFloorId] !== true]),
    ...pixelLayers.map((layer) => [layer.IndoorMapFloorId, layer.IndoorMapFloorId === activePixelLayerId]),
  ]);
  const toggle = (layerId: string) => {
    setSelectedRegionId(null);
    if (pixelLayers.some((layer) => layer.IndoorMapFloorId === layerId)) {
      setPixelChosen(true);
      setPixelLayerId(activePixelLayerId === layerId ? null : layerId);
      return;
    }
    // A georeferenced layer brings the department map back.
    setPixelChosen(true);
    setPixelLayerId(null);
    setHidden((current) => ({ ...current, [layerId]: pixelLayer ? false : current[layerId] !== true }));
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace(customMapsRoutes.home()));
  const title = data?.Map.Name ?? t('maps.custom_maps');

  if (!data) {
    return (
      <View className="flex-1 bg-background-50" testID="custom-map-screen">
        <ScreenHeader title={title} onBack={back} />
        {hasError && !isLoading ? <ZeroState icon={MapIcon} isError heading={t('maps.error_loading')} testID="custom-map-error" /> : <Loading text={t('maps.loading')} />}
      </View>
    );
  }

  const bounds = mapBounds(data.Map);
  const focus = selectedRegion && requestedFeatureId === selectedRegion.IndoorMapZoneId ? usableCenter(selectedRegion.CenterLatitude, selectedRegion.CenterLongitude) : null;
  const center = usableCenter(data.Map.CenterLatitude, data.Map.CenterLongitude);
  const nothingToShow = geoLayers.length === 0 && pixelLayers.length === 0;

  return (
    <View className="flex-1 bg-background-50" testID="custom-map-screen">
      <ScreenHeader title={title} onBack={back} />
      <View style={styles.map}>
        {nothingToShow ? (
          <ZeroState icon={MapIcon} heading={t('custom_maps.nothing_to_show')} description={t('custom_maps.nothing_to_show_detail')} testID="custom-map-nothing" />
        ) : pixelLayer ? (
          <PixelImageMap
            id={`custom-pixel-${pixelLayer.IndoorMapFloorId}`}
            imageUrl={image.url}
            isLocalImage={image.isLocal}
            regions={toPixelRegions(pixelLayer.Regions ?? [])}
            opacity={pixelLayer.Opacity}
            selectedRegionId={selectedRegionId}
            onRegionPress={setSelectedRegionId}
            testID="custom-map-pixel"
          />
        ) : (
          <MapView style={styles.map} testID="custom-map-map">
            {focus ? (
              <Camera centerCoordinate={focus} zoomLevel={18} animationMode="none" />
            ) : bounds ? (
              <Camera bounds={{ ...bounds, ...CAMERA_PADDING }} animationMode="none" />
            ) : center ? (
              <Camera centerCoordinate={center} zoomLevel={15} animationMode="none" />
            ) : null}
            {visibleGeoLayers.map((layer) => (
              <CustomMapRasterLayer key={layer.IndoorMapFloorId} layer={layer} onRegionPress={setSelectedRegionId} selectedRegionId={selectedRegionId} />
            ))}
          </MapView>
        )}
        {pixelLayer && image.missingOffline ? (
          <View style={styles.notice} className="bg-warning-100" testID="custom-map-image-offline">
            <Text className="text-sm text-warning-800">{t('custom_maps.image_not_offline')}</Text>
          </View>
        ) : null}
        {selectedRegion ? <FeatureDetailCard name={selectedRegion.Name} description={selectedRegion.Description} kindKey="maps.region" onClose={() => setSelectedRegionId(null)} testID="custom-map-region" /> : null}
        {toggleItems.length > 1 ? <MapLayersButton onPress={() => setLayersOpen(true)} bottomOffset={selectedRegion ? 140 : 20} testID="custom-map-layers-button" /> : null}
      </View>
      <MapLayersSheet isOpen={layersOpen} onClose={() => setLayersOpen(false)} layers={toggleItems} toggles={toggles} onToggle={toggle} />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  notice: { borderRadius: 8, left: 12, padding: 8, position: 'absolute', right: 12, top: 12 },
});
