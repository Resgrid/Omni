import { CircleLayer, FillLayer, LineLayer, ShapeSource, SymbolLayer } from '@resgrid/maps';
import React, { useMemo } from 'react';

import type { ActiveRouteOverlayData } from '../hooks/use-active-route-overlay';

export interface ActiveRouteOverlayProps {
  route: ActiveRouteOverlayData;
  idPrefix?: string;
}

/** GeoJSON for the overlay's line, remaining stops and geofence (pure; exported for tests). */
export function activeRouteShapes(route: Pick<ActiveRouteOverlayData, 'line' | 'stops' | 'geofence'>) {
  const stops: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: route.stops.map((stop) => ({
      type: 'Feature',
      id: stop.id,
      geometry: { type: 'Point', coordinates: [stop.longitude, stop.latitude] },
      properties: { id: stop.id, label: String(stop.order), color: stop.color, current: stop.isCurrent },
    })),
  };
  const line: GeoJSON.Feature | null = route.line ? { type: 'Feature', geometry: route.line, properties: {} } : null;
  const ring = route.geofence && route.geofence.length >= 3 ? route.geofence : null;
  const geofence: GeoJSON.Feature | null = ring ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} } : null;
  return { stops, line, geofence };
}

/**
 * The unit's running route on the main map (legacy Unit map overlay): the server route line in the plan colour, the
 * current stop's check-in radius, and the remaining stops numbered in route order and coloured by status.
 */
export const ActiveRouteOverlay: React.FC<ActiveRouteOverlayProps> = ({ route, idPrefix = 'map-screen-route' }) => {
  const shapes = useMemo(() => activeRouteShapes(route), [route]);
  return (
    <>
      {shapes.geofence ? (
        <ShapeSource id={`${idPrefix}-geofence`} shape={shapes.geofence}>
          <FillLayer id={`${idPrefix}-geofence-fill`} style={{ fillColor: route.color, fillOpacity: 0.1 }} />
          <LineLayer id={`${idPrefix}-geofence-line`} style={{ lineColor: route.color, lineWidth: 1.5, lineDasharray: [2, 2] }} />
        </ShapeSource>
      ) : null}
      {shapes.line ? (
        <ShapeSource id={`${idPrefix}-line`} shape={shapes.line}>
          <LineLayer id={`${idPrefix}-line-layer`} style={{ lineColor: route.color, lineWidth: 4, lineOpacity: 0.85, lineCap: 'round', lineJoin: 'round' }} />
        </ShapeSource>
      ) : null}
      {shapes.stops.features.length > 0 ? (
        <ShapeSource id={`${idPrefix}-stops`} shape={shapes.stops}>
          <CircleLayer
            id={`${idPrefix}-stops-circle`}
            style={{ circleRadius: ['case', ['get', 'current'], 13, 11], circleColor: ['get', 'color'], circleStrokeWidth: ['case', ['get', 'current'], 3, 2], circleStrokeColor: '#ffffff' }}
          />
          <SymbolLayer id={`${idPrefix}-stops-label`} style={{ textField: ['get', 'label'], textSize: 12, textColor: '#ffffff', textAllowOverlap: true, textIgnorePlacement: true }} />
        </ShapeSource>
      ) : null}
    </>
  );
};
