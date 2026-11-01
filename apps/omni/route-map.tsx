// The Unit routes map (unit-routes' map slot, supplied by the app so the feature never imports a renderer): the server's
// route line, the numbered stops coloured by status, the current stop's geofence and the unit's own position, through
// @resgrid/maps (MapLibre native / maplibre-gl web). Nothing here calls a routing provider; every shape comes from Core.
import type { RenderRouteMap, RouteMapSlotProps } from '@resgrid/features/unit-routes';
import { Camera, CircleLayer, FillLayer, LineLayer, MapView, ShapeSource, type SourcePressEvent, SymbolLayer, UserLocation } from '@resgrid/maps';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';

const CAMERA_PADDING = { paddingTop: 32, paddingRight: 32, paddingBottom: 32, paddingLeft: 32 };

/** GeoJSON for a route map's stops, line and geofence (pure; exported for tests). */
export function routeMapShapes({ stops, line, geofence }: Pick<RouteMapSlotProps, 'stops' | 'line' | 'geofence'>) {
  const stopFeatures: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: stops.map((stop) => ({
      type: 'Feature',
      id: stop.id,
      geometry: { type: 'Point', coordinates: [stop.longitude, stop.latitude] },
      properties: { id: stop.id, label: String(stop.order), color: stop.color, current: stop.isCurrent },
    })),
  };
  const lineFeature: GeoJSON.Feature | null = line ? { type: 'Feature', geometry: line, properties: {} } : null;
  const ring = geofence && geofence.length >= 3 ? [...geofence, geofence[0]] : null;
  const geofenceFeature: GeoJSON.Feature | null = ring ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} } : null;
  return { stops: stopFeatures, line: lineFeature, geofence: geofenceFeature };
}

function RouteMap({ stops, line, geofence, color, bounds, showUserLocation, onStopPress }: RouteMapSlotProps) {
  const shapes = useMemo(() => routeMapShapes({ stops, line, geofence }), [stops, line, geofence]);
  const onPress = useCallback(
    (event: SourcePressEvent) => {
      const id = event.features[0]?.properties?.id;
      if (onStopPress && typeof id === 'string') {
        onStopPress(id);
      }
    },
    [onStopPress]
  );
  return (
    <MapView style={styles.map} compassEnabled={false} testID="route-map">
      <Camera bounds={bounds ? { ...bounds, ...CAMERA_PADDING } : undefined} animationMode="none" />
      {shapes.geofence ? (
        <ShapeSource id="route-geofence" shape={shapes.geofence}>
          <FillLayer id="route-geofence-fill" style={{ fillColor: color, fillOpacity: 0.15 }} />
          <LineLayer id="route-geofence-line" style={{ lineColor: color, lineWidth: 1.5 }} />
        </ShapeSource>
      ) : null}
      {shapes.line ? (
        <ShapeSource id="route-line" shape={shapes.line}>
          <LineLayer id="route-line-layer" style={{ lineColor: color, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }} />
        </ShapeSource>
      ) : null}
      <ShapeSource id="route-stops" shape={shapes.stops} onPress={onPress} hitbox={{ width: 24, height: 24 }}>
        <CircleLayer
          id="route-stops-circle"
          style={{ circleRadius: ['case', ['get', 'current'], 13, 11], circleColor: ['get', 'color'], circleStrokeWidth: ['case', ['get', 'current'], 3, 2], circleStrokeColor: '#ffffff' }}
        />
        <SymbolLayer id="route-stops-label" style={{ textField: ['get', 'label'], textSize: 12, textColor: '#ffffff', textAllowOverlap: true, textIgnorePlacement: true }} />
      </ShapeSource>
      {showUserLocation ? <UserLocation visible={true} showsUserHeadingIndicator={true} /> : null}
    </MapView>
  );
}

/** `UnitRoutesMapProvider`'s renderer (registered around the signed-in shell). */
export const renderRouteMap: RenderRouteMap = (props) => <RouteMap {...props} />;

const styles = StyleSheet.create({
  map: { flex: 1 },
});
