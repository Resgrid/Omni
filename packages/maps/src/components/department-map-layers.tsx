import type { CustomMapLayerResultData, IndoorMapFloorResultData } from '@resgrid/models';
import React, { useMemo } from 'react';

import { boundsToImageCoordinates, buildIndoorFloorImageUrl, indoorZonesToFeatureCollection, resolveCustomMapLayerRendering } from '../lib/custom-maps';
import { useMapServices, useMapTheme } from '../provider/context';
import { FillLayer, ImageSource, LineLayer, RasterLayer, RasterSource, ShapeSource, SymbolLayer } from '../rg';
import type { SourcePressEvent } from '../rg/types';

/**
 * Department map data layers: custom map rasters (server tiles, signed), indoor floor images with their zones, and
 * GeoJSON map layers / geofences. URLs come from the provider's `services.getApiBaseUrl()` + `services.signUrl` (D12).
 */

export interface CustomMapRasterLayerProps {
  layer: CustomMapLayerResultData;
  /** Draw below this style layer (e.g. the pins). */
  belowLayerID?: string;
  showRegions?: boolean;
}

export const CustomMapRasterLayer: React.FC<CustomMapRasterLayerProps> = ({ layer, belowLayerID, showRegions = true }) => {
  const services = useMapServices();
  const rendering = useMemo(() => resolveCustomMapLayerRendering(layer, services.getApiBaseUrl(), services.signUrl), [layer, services]);
  const regions = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    for (const region of layer.Regions ?? []) {
      if (!region.GeoGeometry) continue;
      try {
        const parsed: unknown = JSON.parse(region.GeoGeometry);
        const geometry = (parsed as { type?: string }).type === 'Feature' ? (parsed as GeoJSON.Feature).geometry : (parsed as GeoJSON.Geometry);
        if (geometry && typeof geometry.type === 'string') features.push({ type: 'Feature', id: region.IndoorMapZoneId, geometry, properties: { name: region.Name, color: region.Color || '#3b82f6' } });
      } catch {
        // Malformed region: skip it.
      }
    }
    return { type: 'FeatureCollection', features };
  }, [layer.Regions]);
  const id = `custom-map-${layer.IndoorMapFloorId}`;

  return (
    <>
      {rendering.kind === 'tiles' ? (
        <RasterSource id={`${id}-tiles`} tileUrlTemplates={[rendering.tileUrlTemplate]} tileSize={256} minZoomLevel={rendering.minZoom} maxZoomLevel={rendering.maxZoom}>
          <RasterLayer id={`${id}-tiles-layer`} belowLayerID={belowLayerID} style={{ rasterOpacity: rendering.opacity }} />
        </RasterSource>
      ) : null}
      {rendering.kind === 'image' ? (
        <ImageSource id={`${id}-image`} url={rendering.url} coordinates={rendering.coordinates}>
          <RasterLayer id={`${id}-image-layer`} belowLayerID={belowLayerID} style={{ rasterOpacity: rendering.opacity }} />
        </ImageSource>
      ) : null}
      {showRegions && regions.features.length > 0 ? (
        <ShapeSource id={`${id}-regions`} shape={regions}>
          <FillLayer id={`${id}-regions-fill`} style={{ fillColor: ['get', 'color'], fillOpacity: 0.15 }} />
          <LineLayer id={`${id}-regions-line`} style={{ lineColor: ['get', 'color'], lineWidth: 2 }} />
        </ShapeSource>
      ) : null}
    </>
  );
};

export interface IndoorMapFloorLayerProps {
  floor: IndoorMapFloorResultData;
  onZonePress?: (zoneId: string) => void;
  showZoneLabels?: boolean;
}

/** An indoor floor image over its bounds plus its zones (baseline Unit/IC indoor map screens). */
export const IndoorMapFloorLayer: React.FC<IndoorMapFloorLayerProps> = ({ floor, onZonePress, showZoneLabels = true }) => {
  const services = useMapServices();
  const { colors } = useMapTheme();
  const coordinates = boundsToImageCoordinates(floor);
  const imageUrl = floor.HasImage ? buildIndoorFloorImageUrl(services.getApiBaseUrl(), floor.IndoorMapFloorId, services.signUrl) : null;
  const zones = useMemo(() => indoorZonesToFeatureCollection(floor), [floor]);
  const opacity = Number.isFinite(floor.Opacity) ? Math.min(1, Math.max(0, floor.Opacity)) : 1;
  const id = `indoor-floor-${floor.IndoorMapFloorId}`;
  const handlePress = (event: SourcePressEvent) => {
    const zoneId = (event.features[0]?.properties as { zoneId?: unknown } | null | undefined)?.zoneId;
    if (typeof zoneId === 'string') onZonePress?.(zoneId);
  };

  return (
    <>
      {coordinates && imageUrl ? (
        <ImageSource id={`${id}-image`} url={imageUrl} coordinates={coordinates}>
          <RasterLayer id={`${id}-image-layer`} style={{ rasterOpacity: opacity }} />
        </ImageSource>
      ) : null}
      {zones.features.length > 0 ? (
        <ShapeSource id={`${id}-zones`} shape={zones} onPress={onZonePress ? handlePress : undefined}>
          <FillLayer id={`${id}-zones-fill`} style={{ fillColor: ['get', 'color'], fillOpacity: 0.2 }} />
          <LineLayer id={`${id}-zones-line`} style={{ lineColor: ['get', 'color'], lineWidth: 1.5 }} />
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
