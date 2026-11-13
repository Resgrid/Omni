import React, { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useMapTraffic } from '../provider/context';
import { LineLayer, RasterLayer, RasterSource, VectorSource } from './rg-map';
import type { LineLayerProps } from './types';

/**
 * Live traffic (MapLibre plan §11.1, D8): Mapbox Traffic v1 vector tiles from the server's `TrafficTileUrl`, drawn as
 * congestion-coloured lines (low / moderate / heavy / severe = green / yellow / orange / red; closed roads dark red,
 * dashed) from zoom 10, offset to each side of two-way roads and under the base style's labels where the renderer can
 * place it there (web always; native when the style is a JSON document — otherwise mount it before the app's own layers).
 * The tiles reload every `TrafficRefreshSeconds` while the overlay is visible and the app is in the foreground. Renders
 * nothing when the server has no traffic or the map is offline. Same look as the web kit's `rgTraffic.ts`.
 *
 * A department's own traffic image tiles (`TrafficRasterTileUrl`, e.g. TomTom flow) draw as one raster layer at
 * `TRAFFIC_RASTER_OPACITY`, in the same place and with the same reloads; their colours are the provider's.
 */

export interface TrafficLayerProps {
  /**
   * False hides the lines (and stops the reloads; hidden layers fetch no tiles) but keeps the layers in place, so turning
   * traffic back on does not stack it over layers added since. Default true.
   */
  visible?: boolean;
  /** Draw under this layer instead of under the first label layer. */
  belowLayerID?: string;
  /** Two-way roads carry one line per direction; offset them to the right (default) or left side of travel. */
  drivingSide?: 'right' | 'left';
  /** Source / layer id prefix (two overlays on one map need different ids). */
  idPrefix?: string;
}

export const TRAFFIC_SOURCE_LAYER = 'traffic';
export const TRAFFIC_MIN_ZOOM = 10;

/** Mapbox Traffic v1 is tiled up to z16; MapLibre overzooms beyond. */
const TRAFFIC_MAX_SOURCE_ZOOM = 16;

export const TRAFFIC_COLORS = { low: '#2ecc71', moderate: '#f1c40f', heavy: '#e67e22', severe: '#c0392b', closed: '#7b0d0d' } as const;

/** Image traffic tiles keep the roads under them readable (the web kit uses the same value). */
export const TRAFFIC_RASTER_OPACITY = 0.85;

/** The template with a minute stamp, so each reload fetches fresh congestion instead of a cached tile. */
export const trafficTilesFor = (tileUrl: string, stamp: number): string[] => [`${tileUrl}${tileUrl.includes('?') ? '&' : '?'}rgts=${stamp}`];

const minuteStamp = (): number => Math.floor(Date.now() / 60_000);

/** The current reload stamp: a new one every `refreshSeconds` while `active` and the app is in the foreground. */
export const useTrafficRefreshStamp = (refreshSeconds: number, active: boolean): number => {
  const [stamp, setStamp] = useState(minuteStamp);
  useEffect(() => {
    if (!active) return undefined;
    // A remount after a pause picks up congestion that changed meanwhile.
    setStamp(minuteStamp());

    const handle = setInterval(
      () => {
        // Android keeps JS timers running in the background: never reload tiles nobody sees.
        if (AppState.currentState !== 'background') setStamp(minuteStamp());
      },
      Math.max(60, refreshSeconds) * 1000
    );

    return () => clearInterval(handle);
  }, [active, refreshSeconds]);

  return stamp;
};

type LineStyle = NonNullable<LineLayerProps['style']>;

const congestionColor: LineStyle['lineColor'] = [
  'match',
  ['get', 'congestion'],
  'low',
  TRAFFIC_COLORS.low,
  'moderate',
  TRAFFIC_COLORS.moderate,
  'heavy',
  TRAFFIC_COLORS.heavy,
  'severe',
  TRAFFIC_COLORS.severe,
  TRAFFIC_COLORS.low,
];

const lineWidth: LineStyle['lineWidth'] = ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 4];
const offsetFor = (side: 'right' | 'left'): LineStyle['lineOffset'] => (side === 'left' ? ['interpolate', ['linear'], ['zoom'], 10, -1, 16, -4] : ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 4]);

export const TrafficLayer: React.FC<TrafficLayerProps> = ({ visible = true, belowLayerID, drivingSide = 'right', idPrefix = 'rg-traffic' }) => {
  const traffic = useMapTraffic();
  const available = traffic.available && traffic.tileUrl !== null;
  const stamp = useTrafficRefreshStamp(traffic.refreshSeconds, available && visible);
  const tiles = useMemo(() => (traffic.tileUrl ? trafficTilesFor(traffic.tileUrl, stamp) : []), [stamp, traffic.tileUrl]);
  const lineOffset = offsetFor(drivingSide);
  const placement = belowLayerID ? { belowLayerID } : { belowLabels: true };
  const visibility = visible ? 'visible' : 'none';

  if (!available) return null;

  if (traffic.type === 'raster') {
    return (
      <RasterSource id={`${idPrefix}-raster-source`} tileUrlTemplates={tiles}>
        <RasterLayer id={`${idPrefix}-raster`} {...placement} style={{ rasterOpacity: TRAFFIC_RASTER_OPACITY, visibility }} />
      </RasterSource>
    );
  }

  return (
    <VectorSource id={`${idPrefix}-source`} tileUrlTemplates={tiles} maxZoomLevel={TRAFFIC_MAX_SOURCE_ZOOM}>
      <LineLayer
        id={`${idPrefix}-line`}
        sourceLayerID={TRAFFIC_SOURCE_LAYER}
        minZoomLevel={TRAFFIC_MIN_ZOOM}
        filter={['!=', ['get', 'closed'], 'yes']}
        {...placement}
        style={{ lineColor: congestionColor, lineWidth, lineOffset, lineOpacity: 0.85, lineCap: 'round', lineJoin: 'round', visibility }}
      />
      <LineLayer
        id={`${idPrefix}-closed`}
        sourceLayerID={TRAFFIC_SOURCE_LAYER}
        minZoomLevel={TRAFFIC_MIN_ZOOM}
        filter={['==', ['get', 'closed'], 'yes']}
        {...placement}
        style={{ lineColor: TRAFFIC_COLORS.closed, lineWidth, lineOffset, lineDasharray: [1.5, 1], lineCap: 'butt', visibility }}
      />
    </VectorSource>
  );
};
