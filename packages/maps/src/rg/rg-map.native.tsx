import {
  Camera as MLCamera,
  type CameraRef as MLCameraRef,
  type CameraStop,
  GeoJSONSource,
  type ImageEntry,
  Images as MLImages,
  ImageSource as MLImageSource,
  Layer,
  type LayerProps,
  Map as MLMap,
  type MapRef,
  Marker,
  RasterSource as MLRasterSource,
  UserLocation as MLUserLocation,
  VectorSource as MLVectorSource,
} from '@maplibre/maplibre-react-native';
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useMapProviderContext } from '../provider/context';
import { isValidLngLat } from '../types';
import { isJumpMode, paddingFromArgument, toCameraTarget, toEdgePadding, toInitialView, toNamedAnchor, toTrackUserLocation, validBounds } from './camera-utils';
import { MapPlaceholder } from './map-placeholder';
import { OfflineMapBadge } from './offline-map-badge';
import { firstSymbolLayerId, MapRenderContext, useBelowLabelsLayerId, useStyleRevision } from './render-context';
import { styleSignature, toPaintAndLayout } from './style-props';
import type {
  AttributionPosition,
  CameraProps,
  CameraRef,
  CircleLayerProps,
  FillLayerProps,
  HeatmapLayerProps,
  ImageSourceProps,
  ImagesProps,
  LayerType,
  LineLayerProps,
  MapImageEntry,
  MapPressEvent,
  MapViewProps,
  MapViewRef,
  MarkerViewProps,
  RasterLayerProps,
  RasterSourceProps,
  ShapeSourceProps,
  SymbolLayerProps,
  UserLocationProps,
  VectorSourceProps,
} from './types';
import { useViewStyle } from './use-view-style';

/** iOS / Android renderer of the wrapper API over `@maplibre/maplibre-react-native` 11. */

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
/** Empty layer added before the app's layers when the style is a URL (its label layers are unknown here). */
const OVERLAY_ANCHOR_LAYER_ID = 'rg-overlay-anchor';

const ORNAMENT_POSITIONS: Record<AttributionPosition, { top: number; left: number } | { top: number; right: number } | { bottom: number; right: number } | { bottom: number; left: number }> = {
  'bottom-right': { bottom: 8, right: 8 },
  'bottom-left': { bottom: 8, left: 8 },
  'top-right': { top: 8, right: 8 },
  'top-left': { top: 8, left: 8 },
};

const toPressEvent = (lngLat: [number, number], point: [number, number]): MapPressEvent => ({ coordinates: lngLat, point, geometry: { type: 'Point', coordinates: lngLat } });

export const MapView = forwardRef<MapViewRef, MapViewProps>(function MapView(props, ref) {
  const {
    children,
    style,
    testID,
    compassEnabled = false,
    zoomEnabled = true,
    scrollEnabled = true,
    rotateEnabled = true,
    pitchEnabled = true,
    interactive = true,
    attributionPosition = 'bottom-right',
    styleRevision = 0,
    onPress,
    onLongPress,
    onCameraChanged,
    onDidFinishLoadingMap,
    onDidFailLoadingMap,
    unavailableFallback,
  } = props;
  const view = useViewStyle(props);
  const { reportMapError } = useMapProviderContext();
  // The provider's style (not one passed in): its load failures feed the D16 offline switch, and the offline badge is its.
  const usesProviderStyle = !(props.mapStyle ?? props.styleURL);
  const mapRef = useRef<MapRef>(null);
  const [internalRevision, setInternalRevision] = useState(0);
  const loadedStyleKey = useRef<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      getCenter: async () => (await mapRef.current?.getCenter()) ?? null,
      getZoom: async () => (await mapRef.current?.getZoom()) ?? null,
      getVisibleBounds: async () => {
        const bounds = await mapRef.current?.getBounds();
        return bounds ? { ne: [bounds[2], bounds[3]], sw: [bounds[0], bounds[1]] } : null;
      },
    }),
    []
  );

  // A new style document drops every source and layer added on top: bump the revision once it has loaded so the
  // wrapper's sources/images remount and re-add themselves.
  const handleStyleLoaded = useCallback(() => {
    if (loadedStyleKey.current !== null && loadedStyleKey.current !== view.styleKey) {
      setInternalRevision((value) => value + 1);
    }
    loadedStyleKey.current = view.styleKey;
  }, [view.styleKey]);

  const firstLabelLayerId = useMemo(() => firstSymbolLayerId(view.mapStyle), [view.mapStyle]);
  const renderContext = useMemo(() => ({ styleRevision: internalRevision + styleRevision, belowLabelsLayerId: firstLabelLayerId ?? OVERLAY_ANCHOR_LAYER_ID }), [internalRevision, styleRevision, firstLabelLayerId]);
  const canPan = interactive ? scrollEnabled : false;
  const canZoom = interactive ? zoomEnabled : false;
  const canRotate = interactive ? rotateEnabled : false;
  const canPitch = interactive ? pitchEnabled : false;

  if (!view.mapStyle || view.status !== 'ready') {
    return <MapPlaceholder status={view.status === 'ready' ? 'none' : view.status} style={style} testID={testID} fallback={unavailableFallback} />;
  }

  return (
    <MapRenderContext.Provider value={renderContext}>
      <MLMap
        ref={mapRef}
        mapStyle={view.mapStyle}
        style={StyleSheet.flatten([styles.map, style])}
        testID={testID}
        attribution={true}
        attributionPosition={ORNAMENT_POSITIONS[attributionPosition]}
        logo={false}
        compass={compassEnabled}
        dragPan={canPan}
        touchZoom={canZoom}
        doubleTapZoom={canZoom}
        doubleTapHoldZoom={canZoom}
        touchRotate={canRotate}
        touchPitch={canPitch}
        onPress={onPress ? (event) => onPress(toPressEvent(event.nativeEvent.lngLat, event.nativeEvent.point)) : undefined}
        onLongPress={onLongPress ? (event) => onLongPress(toPressEvent(event.nativeEvent.lngLat, event.nativeEvent.point)) : undefined}
        onRegionDidChange={
          onCameraChanged
            ? (event) => {
                const state = event.nativeEvent;
                onCameraChanged({
                  center: state.center,
                  zoom: state.zoom,
                  heading: state.bearing,
                  pitch: state.pitch,
                  bounds: state.bounds ?? null,
                  isUserInteraction: state.userInteraction,
                  properties: { isUserInteraction: state.userInteraction },
                });
              }
            : undefined
        }
        onDidFinishLoadingMap={onDidFinishLoadingMap ? () => onDidFinishLoadingMap() : undefined}
        onDidFailLoadingMap={() => {
          // MapLibre Native reports no per-tile errors; a style that failed to load is the switch's signal here (overlay
          // sources the app adds — traffic, custom maps, routes — never raise it).
          if (usesProviderStyle) reportMapError?.('style');
          onDidFailLoadingMap?.();
        }}
        onDidFinishLoadingStyle={handleStyleLoaded}
      >
        {firstLabelLayerId ? null : <OverlayAnchor />}
        {children}
        <OfflineMapBadge active={usesProviderStyle} attributionPosition={attributionPosition} />
      </MLMap>
    </MapRenderContext.Provider>
  );
});

const OVERLAY_ANCHOR_LAYER = { id: OVERLAY_ANCHOR_LAYER_ID, type: 'line' } as unknown as LayerProps;

/** The `belowLabels` target on URL styles: mounted first, so it sits above the base style and below every app layer. */
function OverlayAnchor() {
  const revision = useStyleRevision();
  return (
    <GeoJSONSource key={`${OVERLAY_ANCHOR_LAYER_ID}:${revision}`} id={`${OVERLAY_ANCHOR_LAYER_ID}-source`} data={EMPTY_COLLECTION}>
      <Layer {...OVERLAY_ANCHOR_LAYER} />
    </GeoJSONSource>
  );
}

export const Camera = forwardRef<CameraRef, CameraProps>(function Camera(props, ref) {
  const inner = useRef<MLCameraRef>(null);
  const initialView = useRef(toInitialView(props)).current;

  useImperativeHandle(
    ref,
    () => ({
      setCamera: (options) => {
        const camera = inner.current;
        if (!camera) return;
        const duration = isJumpMode(options.animationMode, options.animationDuration) ? 0 : (options.animationDuration ?? 1000);
        if (validBounds(options.bounds)) {
          camera.fitBounds([options.bounds.sw[0], options.bounds.sw[1], options.bounds.ne[0], options.bounds.ne[1]], { padding: toEdgePadding(options.bounds, 40), duration });
          return;
        }
        if (isValidLngLat(options.centerCoordinate)) {
          const stop = { center: options.centerCoordinate, zoom: options.zoomLevel, bearing: options.heading, pitch: options.pitch, padding: options.padding ? toEdgePadding(options.padding) : undefined };
          if (duration === 0) {
            camera.jumpTo(stop);
          } else if (options.animationMode === 'flyTo') {
            camera.flyTo({ ...stop, duration });
          } else {
            camera.easeTo({ ...stop, duration });
          }
          return;
        }
        if (typeof options.zoomLevel === 'number' && Number.isFinite(options.zoomLevel)) {
          camera.zoomTo(options.zoomLevel, { duration });
        }
      },
      flyTo: (coordinate, animationDuration = 1000) => {
        if (isValidLngLat(coordinate)) inner.current?.flyTo({ center: coordinate, duration: animationDuration });
      },
      moveTo: (coordinate, animationDuration = 0) => {
        if (!isValidLngLat(coordinate)) return;
        if (animationDuration > 0) {
          inner.current?.easeTo({ center: coordinate, duration: animationDuration });
        } else {
          inner.current?.jumpTo({ center: coordinate });
        }
      },
      zoomTo: (zoomLevel, animationDuration = 500) => {
        if (Number.isFinite(zoomLevel)) inner.current?.zoomTo(zoomLevel, { duration: animationDuration });
      },
      fitBounds: (ne, sw, padding, animationDuration = 1000) => {
        if (isValidLngLat(ne) && isValidLngLat(sw)) inner.current?.fitBounds([sw[0], sw[1], ne[0], ne[1]], { padding: paddingFromArgument(padding), duration: animationDuration });
      },
    }),
    []
  );

  const target = toCameraTarget(props);
  const common = { zoom: target.zoom, bearing: target.bearing, pitch: target.pitch, padding: target.padding, duration: target.duration, easing: target.easing };
  const stop: Partial<CameraStop> = target.bounds ? { ...common, zoom: undefined, bounds: target.bounds } : target.center ? { ...common, center: target.center } : common;
  const { onUserTrackingModeChange } = props;

  return (
    <MLCamera
      ref={inner}
      initialViewState={initialView ?? undefined}
      minZoom={props.minZoomLevel}
      maxZoom={props.maxZoomLevel}
      maxBounds={props.maxBounds ? [props.maxBounds.sw[0], props.maxBounds.sw[1], props.maxBounds.ne[0], props.maxBounds.ne[1]] : undefined}
      trackUserLocation={toTrackUserLocation(props.followUserLocation, props.followUserMode)}
      onTrackUserLocationChange={onUserTrackingModeChange ? (event) => onUserTrackingModeChange(event.nativeEvent.trackUserLocation != null) : undefined}
      {...stop}
    />
  );
});

export function ShapeSource({ id, shape, onPress, cluster, clusterRadius, clusterMaxZoomLevel, hitbox, children }: ShapeSourceProps) {
  const revision = useStyleRevision();
  return (
    <GeoJSONSource
      key={`${id}:${revision}`}
      id={id}
      data={shape ?? EMPTY_COLLECTION}
      cluster={cluster}
      clusterRadius={clusterRadius}
      clusterMaxZoom={clusterMaxZoomLevel}
      hitbox={hitbox ? { top: hitbox.height / 2, bottom: hitbox.height / 2, left: hitbox.width / 2, right: hitbox.width / 2 } : undefined}
      onPress={
        onPress
          ? (event) => {
              const { features, lngLat, point } = event.nativeEvent;
              onPress({ features, coordinates: lngLat, point });
            }
          : undefined
      }
    >
      {children}
    </GeoJSONSource>
  );
}

// MapLibre Native reads a tile source's `tiles` only when the source is added, so new tiles (a renewed signature, a
// traffic reload) re-add the source: the tiles are part of the key.
export function RasterSource({ id, tileUrlTemplates, tileSize = 256, minZoomLevel, maxZoomLevel, attribution, scheme, children }: RasterSourceProps) {
  const revision = useStyleRevision();
  return (
    <MLRasterSource key={`${id}:${revision}:${tileUrlTemplates.join('|')}`} id={id} tiles={tileUrlTemplates} tileSize={tileSize} minzoom={minZoomLevel} maxzoom={maxZoomLevel} attribution={attribution} scheme={scheme}>
      {children}
    </MLRasterSource>
  );
}

export function VectorSource({ id, tileUrlTemplates, minZoomLevel, maxZoomLevel, attribution, scheme, children }: VectorSourceProps) {
  const revision = useStyleRevision();
  return (
    <MLVectorSource key={`${id}:${revision}:${tileUrlTemplates.join('|')}`} id={id} tiles={tileUrlTemplates} minzoom={minZoomLevel} maxzoom={maxZoomLevel} attribution={attribution} scheme={scheme}>
      {children}
    </MLVectorSource>
  );
}

export function ImageSource({ id, url, coordinates, children }: ImageSourceProps) {
  const revision = useStyleRevision();
  return (
    <MLImageSource key={`${id}:${revision}`} id={id} url={url} coordinates={coordinates}>
      {children}
    </MLImageSource>
  );
}

/** Layers receive `source` from a parent source (MapLibre RN clones it onto its children). */
type InjectedSource = { source?: string };

const useNativeLayerProps = (type: LayerType, props: (LineLayerProps | FillLayerProps | SymbolLayerProps | CircleLayerProps | HeatmapLayerProps | RasterLayerProps) & InjectedSource): LayerProps => {
  const signature = styleSignature(props.style);
  const labelLayerId = useBelowLabelsLayerId();
  // The signature captures the style object's content (inline style objects change identity every render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { paint, layout } = useMemo(() => toPaintAndLayout(type, props.style), [type, signature]);
  const labelsBelow = props.belowLabels ? (labelLayerId ?? undefined) : undefined;
  const spec = {
    id: props.id,
    type,
    source: props.sourceID ?? props.source,
    'source-layer': props.sourceLayerID,
    filter: props.filter,
    minzoom: props.minZoomLevel,
    maxzoom: props.maxZoomLevel,
    paint,
    layout,
    beforeId: props.belowLayerID ?? labelsBelow,
    afterId: props.aboveLayerID,
    layerIndex: props.layerIndex,
  };
  return spec as unknown as LayerProps;
};

function NativeLayer({ layer }: { layer: LayerProps }) {
  const revision = useStyleRevision();
  return <Layer key={`${layer.id ?? ''}:${revision}`} {...layer} />;
}

export function LineLayer(props: LineLayerProps & InjectedSource) {
  return <NativeLayer layer={useNativeLayerProps('line', props)} />;
}

export function FillLayer(props: FillLayerProps & InjectedSource) {
  return <NativeLayer layer={useNativeLayerProps('fill', props)} />;
}

export function SymbolLayer(props: SymbolLayerProps & InjectedSource) {
  return <NativeLayer layer={useNativeLayerProps('symbol', props)} />;
}

export function CircleLayer(props: CircleLayerProps & InjectedSource) {
  return <NativeLayer layer={useNativeLayerProps('circle', props)} />;
}

export function HeatmapLayer(props: HeatmapLayerProps & InjectedSource) {
  return <NativeLayer layer={useNativeLayerProps('heatmap', props)} />;
}

export function RasterLayer(props: RasterLayerProps & InjectedSource) {
  return <NativeLayer layer={useNativeLayerProps('raster', props)} />;
}

export function MarkerView({ id, coordinate, anchor, offset, selected, onPress, testID, children }: MarkerViewProps) {
  if (!isValidLngLat(coordinate)) {
    return null;
  }
  return (
    <Marker id={id} lngLat={coordinate} anchor={toNamedAnchor(anchor)} offset={offset} selected={selected} onPress={onPress ? () => onPress() : undefined} testID={testID}>
      <View collapsable={false}>{children}</View>
    </Marker>
  );
}

/** rnmapbox `PointAnnotation` callers: same as `MarkerView` (`onSelected` → `onPress`). */
export function PointAnnotation({ onSelected, ...props }: MarkerViewProps & { onSelected?: () => void; title?: string }) {
  return <MarkerView {...props} onPress={props.onPress ?? onSelected} />;
}

const toNativeImage = (entry: MapImageEntry): ImageEntry => {
  if (typeof entry === 'string' || typeof entry === 'number') {
    return entry;
  }
  if ('uri' in entry) {
    return { source: { uri: entry.uri } };
  }
  return { source: typeof entry.source === 'string' ? { uri: entry.source } : entry.source, sdf: entry.sdf };
};

export function Images({ images, onImageMissing }: ImagesProps) {
  const revision = useStyleRevision();
  const converted = useMemo(() => Object.fromEntries(Object.entries(images).map(([name, entry]) => [name, toNativeImage(entry)])), [images]);
  return <MLImages key={`images:${revision}`} images={converted} onImageMissing={onImageMissing ? (event) => onImageMissing(event.nativeEvent.image) : undefined} />;
}

export function UserLocation({ visible = true, showsUserHeadingIndicator = false, showsAccuracy = true, minDisplacement, onPress }: UserLocationProps) {
  return visible ? <MLUserLocation heading={showsUserHeadingIndicator} accuracy={showsAccuracy} minDisplacement={minDisplacement} onPress={onPress} /> : null;
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
