import type { FilterSpecification } from '@maplibre/maplibre-react-native';
import React, { useMemo } from 'react';

import { offlineDepartmentSourceId, styleHasGlyphs, styleHasSource } from '../lib/offline-style-sources';
import { useMapStyle, useMapTheme } from '../provider/context';
import { CircleLayer, FillLayer, LineLayer, SymbolLayer } from '../rg';

/**
 * Department map layers and geofences from the offline department data bundle (MapLibre plan §19.2, section `layers`),
 * drawn from the composed offline style's `offline-dept-layers` source — the layers' GeoJSON is not kept on the device
 * otherwise, so without this they vanish offline. Features carry Core's `layerId`, `layerName`, `layerColor` and
 * `onByDefault`; the look matches `GeoJsonMapLayer`. Renders nothing online or when the bundle has no layers section.
 */
export interface OfflineDepartmentLayersProps {
  /** Layer ids the member has on; null or omitted → the department's on-by-default layers. */
  visibleLayerIds?: readonly string[] | null;
  /** Layers already drawn from data loaded online (skipped here so nothing draws twice). */
  excludeLayerIds?: readonly string[];
  showLabels?: boolean;
  idPrefix?: string;
}

export const OFFLINE_LAYERS_SECTION = 'layers';

/** The feature's own colour, else its layer's, else the theme's (empty strings count as missing). */
const colorExpression = (fallback: string): unknown => [
  'case',
  ['all', ['has', 'color'], ['!=', ['get', 'color'], '']],
  ['get', 'color'],
  ['all', ['has', 'layerColor'], ['!=', ['get', 'layerColor'], '']],
  ['get', 'layerColor'],
  fallback,
];

/** Which features of the section draw (pure; exported for tests). */
export function offlineLayersFilter(visibleLayerIds: readonly string[] | null | undefined, excludeLayerIds: readonly string[] = []): FilterSpecification | null {
  const visible = visibleLayerIds ? visibleLayerIds.filter((id) => !excludeLayerIds.includes(id)) : null;
  if (visible && visible.length === 0) return null;
  const parts: unknown[] = [visible ? ['in', ['to-string', ['get', 'layerId']], ['literal', visible]] : ['==', ['get', 'onByDefault'], true]];
  if (!visible && excludeLayerIds.length > 0) parts.push(['!', ['in', ['to-string', ['get', 'layerId']], ['literal', [...excludeLayerIds]]]]);
  return (parts.length === 1 ? parts[0] : ['all', ...parts]) as FilterSpecification;
}

const withGeometry = (filter: FilterSpecification, geometry: unknown): FilterSpecification => ['all', filter, geometry] as unknown as FilterSpecification;

export const OfflineDepartmentLayers: React.FC<OfflineDepartmentLayersProps> = ({ visibleLayerIds, excludeLayerIds, showLabels = true, idPrefix = 'offline-dept-layers' }) => {
  const { mapStyle, isOffline } = useMapStyle();
  const { colors } = useMapTheme();
  const sourceId = offlineDepartmentSourceId(OFFLINE_LAYERS_SECTION);
  const available = isOffline && styleHasSource(mapStyle, sourceId);
  const labels = showLabels && styleHasGlyphs(mapStyle);
  const filter = useMemo(() => offlineLayersFilter(visibleLayerIds, excludeLayerIds), [visibleLayerIds, excludeLayerIds]);
  if (!available || !filter) return null;
  const color = colorExpression(colors.primary) as never;
  return (
    <>
      <FillLayer id={`${idPrefix}-fill`} sourceID={sourceId} filter={withGeometry(filter, ['==', ['geometry-type'], 'Polygon'])} style={{ fillColor: color, fillOpacity: 0.15 }} />
      <LineLayer id={`${idPrefix}-line`} sourceID={sourceId} filter={withGeometry(filter, ['!=', ['geometry-type'], 'Point'])} style={{ lineColor: color, lineWidth: 2 }} />
      <CircleLayer
        id={`${idPrefix}-points`}
        sourceID={sourceId}
        filter={withGeometry(filter, ['==', ['geometry-type'], 'Point'])}
        style={{ circleRadius: 5, circleColor: color, circleStrokeColor: colors.background, circleStrokeWidth: 1.5 }}
      />
      {labels ? (
        <SymbolLayer
          id={`${idPrefix}-labels`}
          sourceID={sourceId}
          filter={withGeometry(filter, ['==', ['geometry-type'], 'Point'])}
          style={{ textField: ['coalesce', ['get', 'name'], ['get', 'Name'], ''], textSize: 11, textOffset: [0, 1.2], textColor: colors.text, textHaloColor: colors.background, textHaloWidth: 1 }}
        />
      ) : null}
    </>
  );
};
