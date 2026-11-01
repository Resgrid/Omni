import { View } from '@resgrid/ui';
import React, { createContext, useContext, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import type { LngLat, RouteBounds, RouteGeometry } from './lib/route-geo';

/** One numbered stop on a route map. */
export interface RouteMapStop {
  id: string;
  order: number;
  name: string;
  latitude: number;
  longitude: number;
  /** Instance stop status (0 pending, 1 checked in, 2 checked out, 3 skipped). */
  status: number;
  isCurrent: boolean;
  /** Marker colour for the status. */
  color: string;
}

export type RouteMapKind = 'plan' | 'active' | 'directions' | 'stop' | 'contact' | 'poi' | 'instance';

/** What a route map draws. Everything comes from the Resgrid server; the renderer must not call a routing provider. */
export interface RouteMapSlotProps {
  kind: RouteMapKind;
  stops: RouteMapStop[];
  /** Server route geometry (planned or from `GetInstanceDirections`). */
  line: RouteGeometry | null;
  /** Geofence ring around the current stop. */
  geofence: LngLat[] | null;
  /** Route colour (plan `RouteColor`). */
  color: string;
  /** Camera bounds covering the stops and line. */
  bounds: RouteBounds | null;
  /** Show the unit's own position (active route, directions). */
  showUserLocation: boolean;
  onStopPress?: (stopId: string) => void;
}

/** Renders a route map with `@resgrid/maps` (MapLibre). Supplied by the app (route file or the provider below). */
export type RenderRouteMap = (props: RouteMapSlotProps) => React.ReactNode;

const RouteMapContext = createContext<RenderRouteMap | null>(null);

/**
 * Supplies the route map renderer to every routes screen once (the Unit root layout), so route files stay one-line
 * re-exports. A screen's own `renderMap` prop wins. Without either, screens show their lists without a map.
 */
export function UnitRoutesMapProvider({ renderMap, children }: { renderMap: RenderRouteMap; children?: React.ReactNode }) {
  return <RouteMapContext.Provider value={renderMap}>{children}</RouteMapContext.Provider>;
}

export const useRouteMapRenderer = (override?: RenderRouteMap | null): RenderRouteMap | null => {
  const fromContext = useContext(RouteMapContext);
  return override ?? fromContext;
};

export interface RouteMapSlotViewProps extends RouteMapSlotProps {
  renderMap?: RenderRouteMap | null;
  height: number;
  testID?: string;
}

/** The map area of a routes screen: the app's renderer at a fixed height, or nothing when no renderer is supplied. */
export const RouteMapSlot: React.FC<RouteMapSlotViewProps> = ({ renderMap, height, testID = 'route-map-slot', ...props }) => {
  const render = useRouteMapRenderer(renderMap);
  const style = useMemo(() => StyleSheet.flatten([styles.map, { height }]), [height]);
  if (!render) return null;
  return (
    <View style={style} testID={testID}>
      {render(props)}
    </View>
  );
};

const styles = StyleSheet.create({
  map: { width: '100%', overflow: 'hidden' },
});
