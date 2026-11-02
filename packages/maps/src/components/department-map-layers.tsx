import type { CustomMapLayerResultData, IndoorMapFloorResultData } from '@resgrid/models';
import React, { useMemo } from 'react';

import { useSignedMapUrl } from '../hooks/use-signed-map-url';
import { boundsToImageCoordinates, buildIndoorFloorImageUrl, indoorZonesToFeatureCollection, resolveCustomMapLayerRendering } from '../lib/custom-maps';
import { offlineCustomMapSourceId, offlineFloorSourceId, styleHasSource } from '../lib/offline-style-sources';
import { useMapServices, useMapStyle, useMapTheme } from '../provider/context';
import { FillLayer, ImageSource, LineLayer, RasterLayer, RasterSource, ShapeSource, SymbolLayer } from '../rg';
import type { SourcePressEvent } from '../rg/types';

/**
 * Department map data layers: custom map rasters (Core's Web Mercator tiles, else the layer image — D21), indoor floor
 * images with their zones, and GeoJSON map layers / geofences. Server-hosted URLs come from `services.getApiBaseUrl()` and
 * reach a source only once signed (`useSignedMapUrl`, D12); until then, or when signing fails, the raster is not drawn.
 * On the offline style (§19.5) the rasters come from the downloaded packs instead (`offline-custom-<layer>` raster
 * PMTiles, `offline-floor-<id>` images) and nothing is fetched.
 */

/** The offline style's source for a custom map layer or floor, when the map is drawn offline and its pack is installed. */
const useOfflineRasterSource = (id: string, kinds: readonly ('custom' | 'floor')[]): string | null => {
  const { mapStyle, isOffline } = useMapStyle();
  return useMemo(() => {
    if (!isOffline) return null;
    for (const kind of kinds) {
      const sourceId = kind === 'custom' ? offlineCustomMapSourceId(id) : offlineFloorSourceId(id);
      if (styleHasSource(mapStyle, sourceId)) return sourceId;
    }
    return null;
    // kinds is a constant per caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isOffline, mapStyle]);
};

const CUSTOM_MAP_OFFLINE_KINDS = ['custom', 'floor'] as const;
const FLOOR_OFFLINE_KINDS = ['floor'] as const;

export interface CustomMapRasterLayerProps {
  layer: CustomMapLayerResultData;
  /** Draw below this style layer (e.g. the pins). */
  belowLayerID?: string;
  showRegions?: boolean;
  /** A region was tapped (its `IndoorMapZoneId`). */
  onRegionPress?: (regionId: string) => void;
  /** Highlighted region. */
  selectedRegionId?: string | null;
}

export const CustomMapRasterLayer: React.FC<CustomMapRasterLayerProps> = ({ layer, belowLayerID, showRegions = true, onRegionPress, selectedRegionId = null }) => {
  const services = useMapServices();
  const rendering = useMemo(() => resolveCustomMapLayerRendering(layer, services.getApiBaseUrl()), [layer, services]);
  const offlineSource = useOfflineRasterSource(layer.IndoorMapFloorId, CUSTOM_MAP_OFFLINE_KINDS);
  const onlineUrl = rendering.kind === 'tiles' ? rendering.tileUrlTemplate : rendering.kind === 'image' ? rendering.url : null;
  const signedUrl = useSignedMapUrl(offlineSource ? null : onlineUrl);
  const opacity = Number.isFinite(layer.Opacity) ? Math.min(1, Math.max(0, layer.Opacity)) : 1;
  const regions = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    for (const region of layer.Regions ?? []) {
      if (!region.GeoGeometry) continue;
      try {
        const parsed: unknown = JSON.parse(region.GeoGeometry);
        const geometry = (parsed as { type?: string }).type === 'Feature' ? (parsed as GeoJSON.Feature).geometry : (parsed as GeoJSON.Geometry);
        if (geometry && typeof geometry.type === 'string')
          features.push({ type: 'Feature', id: region.IndoorMapZoneId, geometry, properties: { regionId: region.IndoorMapZoneId, name: region.Name, color: region.Color || '#3b82f6' } });
      } catch {
        // Malformed region: skip it.
      }
    }
    return { type: 'FeatureCollection', features };
  }, [layer.Regions]);
  const id = `custom-map-${layer.IndoorMapFloorId}`;

  return (
    <>
      {offlineSource ? <RasterLayer id={`${id}-offline-layer`} sourceID={offlineSource} belowLayerID={belowLayerID} style={{ rasterOpacity: opacity }} /> : null}
      {!offlineSource && rendering.kind === 'tiles' && signedUrl ? (
        <RasterSource id={`${id}-tiles`} tileUrlTemplates={[signedUrl]} tileSize={256}>
          <RasterLayer id={`${id}-tiles-layer`} belowLayerID={belowLayerID} style={{ rasterOpacity: rendering.opacity }} />
        </RasterSource>
      ) : null}
      {!offlineSource && rendering.kind === 'image' && signedUrl ? (
        <ImageSource id={`${id}-image`} url={signedUrl} coordinates={rendering.coordinates}>
          <RasterLayer id={`${id}-image-layer`} belowLayerID={belowLayerID} style={{ rasterOpacity: rendering.opacity }} />
        </ImageSource>
      ) : null}
      {showRegions && regions.features.length > 0 ? (
        <ShapeSource
          id={`${id}-regions`}
          shape={regions}
          onPress={
            onRegionPress
              ? (event: SourcePressEvent) => {
                  const regionId = (event.features[0]?.properties as { regionId?: unknown } | null | undefined)?.regionId;
                  if (typeof regionId === 'string') onRegionPress(regionId);
                }
              : undefined
          }
        >
          <FillLayer id={`${id}-regions-fill`} style={{ fillColor: ['get', 'color'], fillOpacity: ['case', ['==', ['get', 'regionId'], selectedRegionId ?? ''], 0.4, 0.15] }} />
          <LineLayer id={`${id}-regions-line`} style={{ lineColor: ['get', 'color'], lineWidth: ['case', ['==', ['get', 'regionId'], selectedRegionId ?? ''], 3, 2] }} />
        </ShapeSource>
      ) : null}
    </>
  );
};

export interface IndoorMapFloorLayerProps {
  floor: IndoorMapFloorResultData;
  onZonePress?: (zoneId: string) => void;
  showZoneLabels?: boolean;
  /** Highlighted zone. */
  selectedZoneId?: string | null;
}

/** An indoor floor image over its bounds plus its zones (baseline Unit/IC indoor map screens). */
export const IndoorMapFloorLayer: React.FC<IndoorMapFloorLayerProps> = ({ floor, onZonePress, showZoneLabels = true, selectedZoneId = null }) => {
  const services = useMapServices();
  const { colors } = useMapTheme();
  const coordinates = boundsToImageCoordinates(floor);
  const offlineSource = useOfflineRasterSource(floor.IndoorMapFloorId, FLOOR_OFFLINE_KINDS);
  const imageUrl = useSignedMapUrl(floor.HasImage && !offlineSource ? buildIndoorFloorImageUrl(services.getApiBaseUrl(), floor.IndoorMapFloorId) : null);
  const zones = useMemo(() => indoorZonesToFeatureCollection(floor), [floor]);
  const opacity = Number.isFinite(floor.Opacity) ? Math.min(1, Math.max(0, floor.Opacity)) : 1;
  const id = `indoor-floor-${floor.IndoorMapFloorId}`;
  const handlePress = (event: SourcePressEvent) => {
    const zoneId = (event.features[0]?.properties as { zoneId?: unknown } | null | undefined)?.zoneId;
    if (typeof zoneId === 'string') onZonePress?.(zoneId);
  };

  return (
    <>
      {offlineSource ? <RasterLayer id={`${id}-offline-layer`} sourceID={offlineSource} style={{ rasterOpacity: opacity }} /> : null}
      {!offlineSource && coordinates && imageUrl ? (
        <ImageSource id={`${id}-image`} url={imageUrl} coordinates={coordinates}>
          <RasterLayer id={`${id}-image-layer`} style={{ rasterOpacity: opacity }} />
        </ImageSource>
      ) : null}
      {zones.features.length > 0 ? (
        <ShapeSource id={`${id}-zones`} shape={zones} onPress={onZonePress ? handlePress : undefined}>
          <FillLayer id={`${id}-zones-fill`} style={{ fillColor: ['get', 'color'], fillOpacity: ['case', ['==', ['get', 'zoneId'], selectedZoneId ?? ''], 0.45, 0.2] }} />
          <LineLayer id={`${id}-zones-line`} style={{ lineColor: ['get', 'color'], lineWidth: ['case', ['==', ['get', 'zoneId'], selectedZoneId ?? ''], 3, 1.5] }} />
          {showZoneLabels ? <SymbolLayer id={`${id}-zones-label`} style={{ textField: ['get', 'name'], textSize: 12, textColor: colors.text, textHaloColor: colors.background, textHaloWidth: 1 }} /> : null}
        </ShapeSource>
      ) : null}
    </>
  );
};

export interface GeoJsonMapLayerProps {
  id: string;
  data: GeoJSON.FeatureCollection | null | undefined;
  /** Layer colour (map layers / geofences carry one); features may override with a `color` property. */
  color?: string | null;
  fillOpacity?: number;
  showLabels?: boolean;
  onFeaturePress?: (feature: GeoJSON.Feature) => void;
}

/** A department map layer / geofence (`GetMapLayerGeoJSON/{layerId}`): fill + outline + points + labels. */
export const GeoJsonMapLayer: React.FC<GeoJsonMapLayerProps> = ({ id, data, color, fillOpacity = 0.15, showLabels = false, onFeaturePress }) => {
  const { colors } = useMapTheme();
  const base = color?.trim() || colors.primary;
  const featureColor: ['coalesce', ['get', string], string] = ['coalesce', ['get', 'color'], base];
  if (!data || data.features.length === 0) return null;
  return (
    <ShapeSource id={`${id}-source`} shape={data} onPress={onFeaturePress ? (event) => (event.features[0] ? onFeaturePress(event.features[0]) : undefined) : undefined}>
      <FillLayer id={`${id}-fill`} filter={['==', ['geometry-type'], 'Polygon']} style={{ fillColor: featureColor, fillOpacity }} />
      <LineLayer id={`${id}-line`} filter={['!=', ['geometry-type'], 'Point']} style={{ lineColor: featureColor, lineWidth: 2 }} />
      <SymbolLayer
        id={`${id}-points`}
        filter={['==', ['geometry-type'], 'Point']}
        style={{ textField: showLabels ? ['coalesce', ['get', 'name'], ['get', 'Name'], ''] : '', textSize: 11, textColor: colors.text, textHaloColor: colors.background, textHaloWidth: 1 }}
      />
    </ShapeSource>
  );
};
