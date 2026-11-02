import React, { useMemo } from 'react';

import type { LngLat } from '../types';
import { LineLayer, ShapeSource } from './rg-map';

/**
 * A route as map layers (MapLibre plan §8.1 `route-layer`): the line ahead over a casing, the part already driven dimmed,
 * and — when the provider sent Mapbox `congestion` annotations — the line ahead coloured by congestion. Shapes come
 * from the Resgrid server's route; nothing here calls a routing provider.
 */
export interface RouteLineProps {
  /** Layer id prefix (several routes can share a map). */
  id: string;
  /** The route ahead (or the whole route), `[lon, lat]`. */
  line: readonly LngLat[] | null;
  /** The part already driven, drawn dimmed under the line ahead. */
  traversed?: readonly LngLat[] | null;
  /** Congestion per segment of `line` (`low`, `moderate`, `heavy`, `severe`, else unknown). */
  congestion?: readonly (string | null)[] | null;
  color?: string;
  casingColor?: string;
  traversedColor?: string;
  width?: number;
  belowLayerID?: string;
}

/** Congestion colours shared with the traffic overlay (§11.1). */
export const CONGESTION_COLORS = { low: '#22c55e', moderate: '#eab308', heavy: '#f97316', severe: '#dc2626' } as const;

const lineFeature = (coordinates: readonly LngLat[] | null | undefined): GeoJSON.Feature<GeoJSON.LineString> | null =>
  coordinates && coordinates.length >= 2 ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coordinates.map((c) => [c[0], c[1]]) } } : null;

/** One feature per run of equal congestion along the line (pure; exported for tests). */
export const congestionSegments = (line: readonly LngLat[], congestion: readonly (string | null)[]): GeoJSON.FeatureCollection<GeoJSON.LineString> => {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  let start = 0;
  for (let i = 1; i <= congestion.length; i += 1) {
    if (i === congestion.length || congestion[i] !== congestion[start]) {
      const coordinates = line.slice(start, i + 1).map((c) => [c[0], c[1]]);
      if (coordinates.length >= 2) features.push({ type: 'Feature', properties: { congestion: congestion[start] ?? 'unknown' }, geometry: { type: 'LineString', coordinates } });
      start = i;
    }
  }
  return { type: 'FeatureCollection', features };
};

export const RouteLine: React.FC<RouteLineProps> = ({ id, line, traversed, congestion, color = '#2563eb', casingColor = '#1e3a8a', traversedColor = '#9ca3af', width = 7, belowLayerID }) => {
  const ahead = useMemo(() => lineFeature(line), [line]);
  const behind = useMemo(() => lineFeature(traversed), [traversed]);
  const segments = useMemo(() => (line && congestion && congestion.length === line.length - 1 ? congestionSegments(line, congestion) : null), [line, congestion]);
  const round = { lineCap: 'round', lineJoin: 'round' } as const;
  return (
    <>
      {behind ? (
        <ShapeSource id={`${id}-traversed`} shape={behind}>
          <LineLayer id={`${id}-traversed-line`} belowLayerID={belowLayerID} style={{ ...round, lineColor: traversedColor, lineWidth: width - 1, lineOpacity: 0.8 }} />
        </ShapeSource>
      ) : null}
      {ahead ? (
        <ShapeSource id={`${id}-ahead`} shape={ahead}>
          <LineLayer id={`${id}-casing`} belowLayerID={belowLayerID} style={{ ...round, lineColor: casingColor, lineWidth: width + 3 }} />
          <LineLayer id={`${id}-line`} belowLayerID={belowLayerID} style={{ ...round, lineColor: color, lineWidth: width }} />
        </ShapeSource>
      ) : null}
      {segments ? (
        <ShapeSource id={`${id}-congestion`} shape={segments}>
          <LineLayer
            id={`${id}-congestion-line`}
            belowLayerID={belowLayerID}
            filter={['!=', ['get', 'congestion'], 'unknown']}
            style={{
              ...round,
              lineWidth: width - 2,
              lineColor: ['match', ['get', 'congestion'], 'low', CONGESTION_COLORS.low, 'moderate', CONGESTION_COLORS.moderate, 'heavy', CONGESTION_COLORS.heavy, 'severe', CONGESTION_COLORS.severe, color],
            }}
          />
        </ShapeSource>
      ) : null}
    </>
  );
};
