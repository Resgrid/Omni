import { Camera, CircleLayer, type LngLat, type MapCameraChangedEvent, MapView, RouteLine, ShapeSource, UnitLocationMarker } from '@resgrid/maps';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { sliceLine } from '../engine/geo';
import type { NavFix, NavProgress } from '../engine/progress';
import type { NavRoute } from '../engine/route-model';

export type NavigationCameraMode = 'follow' | 'overview' | 'free';

export interface NavigationMapProps {
  route: NavRoute;
  progress: NavProgress | null;
  fix: NavFix | null;
  /** Leg being driven to (its destination is marked). */
  activeLegIndex: number;
  cameraMode: NavigationCameraMode;
  /** The user panned or zoomed: the screen switches to `free` and offers Recenter. */
  onUserMovedMap: () => void;
  /** Extra layers drawn under the route (the traffic overlay). */
  underlay?: React.ReactNode;
  /** Space the banner and trip bar cover, so the vehicle sits in the open part of the map. */
  padding?: { top: number; bottom: number };
  testID?: string;
}

/** Zoom by speed (m/s): close in town, wider on the highway. */
export const followZoomForSpeed = (speed: number | null): number => {
  const v = speed ?? 0;
  if (v < 8) return 17;
  if (v < 15) return 16.5;
  if (v < 25) return 16;
  return 15;
};

/** Course for the camera: the fix's heading while moving, else the route's bearing at the snapped point. */
export const cameraBearing = (fix: NavFix | null, progress: NavProgress | null): number => {
  if (fix && fix.heading !== null && fix.heading >= 0 && (fix.speed ?? 0) >= 2) return fix.heading;
  return progress?.routeBearing ?? 0;
};

const boundsOf = (points: readonly LngLat[]): { ne: LngLat; sw: LngLat } | null => {
  if (points.length === 0) return null;
  let west = points[0][0];
  let east = points[0][0];
  let south = points[0][1];
  let north = points[0][1];
  for (const [lon, lat] of points) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { ne: [east, north], sw: [west, south] };
};

/**
 * The navigation map: route ahead (congestion-coloured when annotated), driven part dimmed, the destination of the
 * active leg, the vehicle at its snapped position, and a follow camera (course-up, pitched, zoom by speed) or an
 * overview of what is left.
 */
export const NavigationMap: React.FC<NavigationMapProps> = ({ route, progress, fix, activeLegIndex, cameraMode, onUserMovedMap, underlay, padding = { top: 180, bottom: 140 }, testID = 'navigation-map' }) => {
  const along = progress?.distanceAlong ?? 0;
  // Re-slice only when progress moves a few metres (fixes arrive every second).
  const sliceAt = Math.round(along / 5) * 5;
  const ahead = useMemo(() => sliceLine(route.coordinates, route.cumulative, sliceAt, route.distance), [route, sliceAt]);
  const behind = useMemo(() => sliceLine(route.coordinates, route.cumulative, 0, sliceAt), [route, sliceAt]);
  const congestion = useMemo(() => {
    if (!route.congestion || !progress) return null;
    // `ahead` starts with the snapped point followed by the remaining coordinates: drop the segments already driven.
    return route.congestion.slice(progress.segmentIndex);
  }, [route.congestion, progress]);
  const leg = route.legs[Math.min(activeLegIndex, route.legs.length - 1)];
  const destination = useMemo<GeoJSON.Feature<GeoJSON.Point>>(() => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [leg.destination[0], leg.destination[1]] } }), [leg.destination]);
  const vehicle: LngLat | null = progress ? progress.snapped : fix ? [fix.longitude, fix.latitude] : null;
  const overview = useMemo(() => boundsOf(ahead.length > 0 ? ahead : route.coordinates), [ahead, route.coordinates]);

  const onCameraChanged = useCallback(
    (event: MapCameraChangedEvent) => {
      if (event.isUserInteraction && cameraMode !== 'free') onUserMovedMap();
    },
    [cameraMode, onUserMovedMap]
  );

  const cameraPadding = { paddingTop: padding.top, paddingBottom: padding.bottom, paddingLeft: 40, paddingRight: 40 };
  return (
    <MapView style={styles.map} compassEnabled={cameraMode !== 'follow'} pitchEnabled={true} onCameraChanged={onCameraChanged} testID={testID}>
      {cameraMode === 'follow' && vehicle ? (
        <Camera centerCoordinate={vehicle} heading={cameraBearing(fix, progress)} pitch={50} zoomLevel={followZoomForSpeed(fix?.speed ?? null)} padding={cameraPadding} animationMode="easeTo" animationDuration={900} />
      ) : null}
      {cameraMode === 'overview' && overview ? <Camera bounds={{ ...overview, ...cameraPadding }} heading={0} pitch={0} animationMode="easeTo" animationDuration={600} /> : null}
      {underlay}
      <RouteLine id="navigation-route" line={ahead} traversed={behind} congestion={congestion} />
      <ShapeSource id="navigation-destination" shape={destination}>
        <CircleLayer id="navigation-destination-circle" style={{ circleRadius: 10, circleColor: '#dc2626', circleStrokeColor: '#ffffff', circleStrokeWidth: 3 }} />
      </ShapeSource>
      {vehicle ? <UnitLocationMarker latitude={vehicle[1]} longitude={vehicle[0]} heading={cameraBearing(fix, progress)} accuracy={null} idPrefix="navigation-vehicle" /> : null}
    </MapView>
  );
};

const styles = StyleSheet.create({ map: { flex: 1 } });
