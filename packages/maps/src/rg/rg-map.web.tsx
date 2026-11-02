import './maplibre-css.web';

import { logger } from '@resgrid/core';
import { Asset } from 'expo-asset';
import type {
  FilterSpecification,
  GeoJSONSource as GLGeoJSONSource,
  ImageSource as GLImageSource,
  LayerSpecification,
  Map as GLMap,
  MapMouseEvent,
  MapStyleImageMissingEvent,
  Marker,
  SourceSpecification,
} from 'maplibre-gl';
import React, { createContext, forwardRef, type ReactNode, type ReactPortal, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isValidLngLat, type LngLat } from '../types';
import { isJumpMode, paddingFromArgument, toCameraTarget, toEdgePadding, toInitialView, toNamedAnchor, validBounds } from './camera-utils';
import { MapPlaceholder } from './map-placeholder';
import { getLoadedMapLibre, loadMapLibre, type MapLibreModule } from './maplibre-loader.web';
import { MapRenderContext, useStyleRevision } from './render-context';
import { styleSignature, toPaintAndLayout } from './style-props';
import type {
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
} from './types';
import { useViewStyle } from './use-view-style';

/**
 * Web / Electron renderer of the wrapper API over maplibre-gl (generalized from Unit/IC `map-view.web.tsx`). Children
 * render only after the map's first `load`; every source, layer and image re-adds itself after a style swap
 * (`setStyle` rebuilds the style document and drops everything added on top).
 */

// react-dom ships without types in this workspace (no @types/react-dom); type the one function this renderer uses.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPortal } = require('react-dom') as { createPortal: (children: ReactNode, container: Element) => ReactPortal };

const WebMapContext = createContext<GLMap | null>(null);
/** The id of the enclosing source once it exists in the current style (null while it is being (re-)added). */
const SourceContext = createContext<string | null>(null);

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const removedMaps = new WeakSet<GLMap>();
const PROGRAMMATIC = { resgridProgrammatic: true };

/** Never log a Mapbox token that a failed tile/style URL carries. */
const redactTokens = (message: string): string => message.replace(/access_token=[^&\s"']+/gi, 'access_token=REDACTED');

const warn = (message: string, error: unknown): void => {
  logger.warn({ message, context: { reason: redactTokens(error instanceof Error ? error.message : String(error)) } });
};

/** maplibre-gl for code that runs only inside a created map (MapView loaded the module before creating it). */
const maplibre = (): MapLibreModule => {
  const module = getLoadedMapLibre();
  if (!module) throw new Error('maplibre-gl is not loaded');
  return module;
};

const safeRemoveLayer = (map: GLMap, id: string): void => {
  try {
    if (!removedMaps.has(map) && map.getLayer(id)) map.removeLayer(id);
  } catch {
    // The style may be mid-swap or the map gone.
  }
};

const safeRemoveSource = (map: GLMap, id: string): void => {
  try {
    if (!removedMaps.has(map) && map.getSource(id)) map.removeSource(id);
  } catch {
    // The style may be mid-swap or the map gone.
  }
};

const resolveAssetUri = (source: string | number | { uri: string }): string | null => {
  if (typeof source === 'string') return source;
  if (typeof source === 'number') {
    try {
      return Asset.fromModule(source).uri ?? null;
    } catch {
      return null;
    }
  }
  return typeof source.uri === 'string' ? source.uri : null;
};

const toPressEvent = (event: MapMouseEvent): MapPressEvent => {
  const coordinates: LngLat = [event.lngLat.lng, event.lngLat.lat];
  return { coordinates, point: [event.point.x, event.point.y], geometry: { type: 'Point', coordinates } };
};

const attributionCorner = (position: MapViewProps['attributionPosition']): 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' => position ?? 'bottom-right';

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
    attributionPosition,
    styleRevision = 0,
    unavailableFallback,
  } = props;
  const view = useViewStyle(props);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GLMap | null>(null);
  const loadedRef = useRef(false);
  const appliedStyleKey = useRef<string | null>(null);
  const [map, setMap] = useState<GLMap | null>(null);
  const [hasSize, setHasSize] = useState(false);
  const [internalRevision, setInternalRevision] = useState(0);
  const latest = useRef(props);
  latest.current = props;
  const latestView = useRef(view);
  latestView.current = view;
  const ready = view.status === 'ready' && !!view.mapStyle;

  useImperativeHandle(
    ref,
    () => ({
      getCenter: async () => {
        const center = mapRef.current?.getCenter();
        return center ? [center.lng, center.lat] : null;
      },
      getZoom: async () => mapRef.current?.getZoom() ?? null,
      getVisibleBounds: async () => {
        const bounds = mapRef.current?.getBounds();
        return bounds ? { ne: [bounds.getEast(), bounds.getNorth()], sw: [bounds.getWest(), bounds.getSouth()] } : null;
      },
    }),
    []
  );

  // maplibre-gl throws in its projection maths on a 0×0 container: wait for layout.
  useEffect(() => {
    const element = containerRef.current;
    if (!ready || !element) return undefined;
    const check = (): boolean => {
      if (element.clientWidth > 0 && element.clientHeight > 0) {
        setHasSize(true);
        return true;
      }
      return false;
    };
    if (check() || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (check()) observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);

  // Builds the map with the current style and wires its events (maplibre-gl is loaded by then).
  const createMap = (gl: MapLibreModule, element: HTMLDivElement): GLMap | null => {
    const initial = latest.current;
    const { mapStyle, styleKey } = latestView.current;
    if (!mapStyle) return null;
    let instance: GLMap;
    try {
      instance = new gl.Map({
        container: element,
        style: mapStyle,
        center: isValidLngLat(initial.initialCenter) ? initial.initialCenter : undefined,
        zoom: typeof initial.initialZoom === 'number' && Number.isFinite(initial.initialZoom) ? initial.initialZoom : undefined,
        attributionControl: false,
        maplibreLogo: false,
        interactive: true,
      });
    } catch (error) {
      warn('Failed to initialize maplibre-gl', error);
      latest.current.onDidFailLoadingMap?.();
      return null;
    }
    mapRef.current = instance;
    appliedStyleKey.current = styleKey;
    instance.on('load', () => {
      loadedRef.current = true;
      setMap(instance);
      latest.current.onDidFinishLoadingMap?.();
    });
    instance.on('style.load', () => {
      if (loadedRef.current) setInternalRevision((value) => value + 1);
    });
    instance.on('click', (event: MapMouseEvent) => latest.current.onPress?.(toPressEvent(event)));
    instance.on('contextmenu', (event: MapMouseEvent) => latest.current.onLongPress?.(toPressEvent(event)));
    instance.on('moveend', (event: { originalEvent?: unknown; resgridProgrammatic?: boolean }) => {
      const handler = latest.current.onCameraChanged;
      if (!handler) return;
      const center = instance.getCenter();
      const bounds = instance.getBounds();
      const isUserInteraction = !!event.originalEvent && !event.resgridProgrammatic;
      handler({
        center: [center.lng, center.lat],
        zoom: instance.getZoom(),
        heading: instance.getBearing(),
        pitch: instance.getPitch(),
        bounds: bounds ? [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()] : null,
        isUserInteraction,
        properties: { isUserInteraction },
      });
    });
    instance.on('error', (event: { error?: unknown }) => warn('maplibre-gl error', event.error));
    return instance;
  };

  // Create the map once (per container) when there is a style and a size — after maplibre-gl has loaded (immediately
  // when an earlier map loaded it). The style is read when the map is created, so a switch during the load is kept.
  useEffect(() => {
    const element = containerRef.current;
    if (!hasSize || !element || mapRef.current || !view.mapStyle) return undefined;
    let cancelled = false;
    let instance: GLMap | null = null;
    const create = (gl: MapLibreModule): void => {
      if (cancelled || mapRef.current) return;
      instance = createMap(gl, element);
    };
    const loadedModule = getLoadedMapLibre();
    if (loadedModule) {
      create(loadedModule);
    } else {
      void loadMapLibre().then(create, (error: unknown) => {
        if (cancelled) return;
        warn('Failed to load maplibre-gl', error);
        latest.current.onDidFailLoadingMap?.();
      });
    }
    return () => {
      cancelled = true;
      const created = instance;
      if (!created) return;
      removedMaps.add(created);
      loadedRef.current = false;
      mapRef.current = null;
      setMap(null);
      try {
        created.remove();
      } catch {
        // Already torn down.
      }
    };
    // Created once per size/availability; style changes go through setStyle below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSize, ready]);

  // Theme / server / offline switch: full style rebuild (diff: false) so `style.load` fires and children re-add.
  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || !view.mapStyle || appliedStyleKey.current === view.styleKey) return;
    appliedStyleKey.current = view.styleKey;
    try {
      instance.setStyle(view.mapStyle, { diff: false });
    } catch (error) {
      warn('Failed to switch map style', error);
    }
  }, [view.mapStyle, view.styleKey]);

  // Keep the canvas in step with its container.
  useEffect(() => {
    const element = containerRef.current;
    if (!map || !element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0 && element.clientHeight > 0) {
        try {
          map.resize();
        } catch {
          // Teardown race.
        }
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [map]);

  // Gesture handlers follow the props (the home map locks/unlocks at runtime).
  useEffect(() => {
    if (!map) return;
    const apply = (handler: { enable(): void; disable(): void } | undefined, enabled: boolean): void => {
      try {
        if (enabled) handler?.enable();
        else handler?.disable();
      } catch {
        // Handler missing on this build.
      }
    };
    apply(map.dragPan, interactive && scrollEnabled);
    apply(map.scrollZoom, interactive && zoomEnabled);
    apply(map.doubleClickZoom, interactive && zoomEnabled);
    apply(map.boxZoom, interactive && zoomEnabled);
    apply(map.keyboard, interactive);
    apply(map.dragRotate, interactive && rotateEnabled);
    apply(map.touchZoomRotate, interactive && (zoomEnabled || rotateEnabled));
    apply(map.touchPitch, interactive && pitchEnabled);
  }, [map, interactive, scrollEnabled, zoomEnabled, rotateEnabled, pitchEnabled]);

  // Attribution is always on (OSM ODbL, Mapbox terms); the custom text follows the provider.
  useEffect(() => {
    if (!map) return undefined;
    const { AttributionControl } = maplibre();
    const control = new AttributionControl({ compact: true, customAttribution: view.attribution || undefined });
    map.addControl(control, attributionCorner(attributionPosition));
    return () => {
      try {
        map.removeControl(control);
      } catch {
        // Map gone.
      }
    };
  }, [map, view.attribution, attributionPosition]);

  useEffect(() => {
    if (!map || !compassEnabled) return undefined;
    const { NavigationControl } = maplibre();
    const control = new NavigationControl({ showCompass: true, showZoom: false });
    map.addControl(control, 'top-right');
    return () => {
      try {
        map.removeControl(control);
      } catch {
        // Map gone.
      }
    };
  }, [map, compassEnabled]);

  const renderContext = useMemo(() => ({ styleRevision: internalRevision + styleRevision }), [internalRevision, styleRevision]);

  if (!ready) {
    return <MapPlaceholder status={view.status === 'ready' ? 'none' : view.status} style={style} testID={testID} fallback={unavailableFallback} />;
  }

  return (
    <View style={StyleSheet.flatten([styles.container, style])} testID={testID}>
      <div ref={containerRef} style={CONTAINER_STYLE} data-testid={testID ? `${testID}-canvas` : 'map-canvas'} />
      {map ? (
        <WebMapContext.Provider value={map}>
          <MapRenderContext.Provider value={renderContext}>{children}</MapRenderContext.Provider>
        </WebMapContext.Provider>
      ) : null}
    </View>
  );
});

const CONTAINER_STYLE = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

export const Camera = forwardRef<CameraRef, CameraProps>(function Camera(props, ref) {
  const map = useContext(WebMapContext);
  const initialized = useRef(false);
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(
    ref,
    () => ({
      setCamera: (options) => {
        if (!map) return;
        const duration = isJumpMode(options.animationMode, options.animationDuration) ? 0 : (options.animationDuration ?? 1000);
        try {
          if (validBounds(options.bounds)) {
            map.fitBounds([options.bounds.sw, options.bounds.ne], { padding: toEdgePadding(options.bounds, 40), duration }, PROGRAMMATIC);
            return;
          }
          const center = isValidLngLat(options.centerCoordinate) ? options.centerCoordinate : undefined;
          const camera = { center, zoom: options.zoomLevel, bearing: options.heading, pitch: options.pitch, padding: options.padding ? toEdgePadding(options.padding) : undefined };
          if (duration === 0) map.jumpTo(camera, PROGRAMMATIC);
          else if (options.animationMode === 'flyTo') map.flyTo({ ...camera, duration }, PROGRAMMATIC);
          else map.easeTo({ ...camera, duration }, PROGRAMMATIC);
        } catch {
          // Projection errors during resize / teardown.
        }
      },
      flyTo: (coordinate, animationDuration = 1000) => {
        if (map && isValidLngLat(coordinate)) map.flyTo({ center: coordinate, duration: animationDuration }, PROGRAMMATIC);
      },
      moveTo: (coordinate, animationDuration = 0) => {
        if (!map || !isValidLngLat(coordinate)) return;
        if (animationDuration > 0) map.easeTo({ center: coordinate, duration: animationDuration }, PROGRAMMATIC);
        else map.jumpTo({ center: coordinate }, PROGRAMMATIC);
      },
      zoomTo: (zoomLevel, animationDuration = 500) => {
        if (map && Number.isFinite(zoomLevel)) map.zoomTo(zoomLevel, { duration: animationDuration }, PROGRAMMATIC);
      },
      fitBounds: (ne, sw, padding, animationDuration = 1000) => {
        if (!map || !isValidLngLat(ne) || !isValidLngLat(sw)) return;
        try {
          map.fitBounds([sw, ne], { padding: paddingFromArgument(padding), duration: animationDuration }, PROGRAMMATIC);
        } catch {
          // Projection errors.
        }
      },
    }),
    [map]
  );

  // Initial placement (defaultSettings), like the native Camera.
  useEffect(() => {
    if (!map || initialized.current) return;
    const initial = toInitialView(latest.current);
    if (!initial) return;
    initialized.current = true;
    try {
      map.jumpTo({ center: initial.center, zoom: initial.zoom, bearing: initial.bearing, pitch: initial.pitch }, PROGRAMMATIC);
    } catch {
      // Projection errors during initialization.
    }
  }, [map]);

  const target = toCameraTarget(props);
  const targetKey = JSON.stringify(target);
  useEffect(() => {
    if (!map) return;
    try {
      if (target.bounds) {
        map.fitBounds(
          [
            [target.bounds[0], target.bounds[1]],
            [target.bounds[2], target.bounds[3]],
          ],
          { padding: target.padding, duration: target.duration ?? 0 },
          PROGRAMMATIC
        );
        return;
      }
      if (!target.center && target.zoom === undefined) return;
      const camera = { center: target.center, zoom: target.zoom, bearing: target.bearing, pitch: target.pitch, padding: target.padding };
      if (target.duration === 0 || target.easing === undefined) map.jumpTo(camera, PROGRAMMATIC);
      else if (target.easing === 'fly') map.flyTo({ ...camera, duration: target.duration }, PROGRAMMATIC);
      else map.easeTo({ ...camera, duration: target.duration }, PROGRAMMATIC);
    } catch {
      // Projection errors during resize / transition.
    }
    // targetKey is the serialized target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, targetKey]);

  useEffect(() => {
    if (!map) return;
    if (typeof props.minZoomLevel === 'number') map.setMinZoom(props.minZoomLevel);
    if (typeof props.maxZoomLevel === 'number') map.setMaxZoom(props.maxZoomLevel);
    if (props.maxBounds) map.setMaxBounds([props.maxBounds.sw, props.maxBounds.ne]);
  }, [map, props.minZoomLevel, props.maxZoomLevel, props.maxBounds]);

  // Follow the user through the GeolocateControl (the web equivalent of trackUserLocation).
  const { followUserLocation } = props;
  useEffect(() => {
    if (!map || !followUserLocation) return undefined;
    const { GeolocateControl } = maplibre();
    const control = new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true });
    map.addControl(control);
    control.on('trackuserlocationstart', () => latest.current.onUserTrackingModeChange?.(true));
    control.on('trackuserlocationend', () => latest.current.onUserTrackingModeChange?.(false));
    const timer = setTimeout(() => {
      try {
        control.trigger();
      } catch {
        // Geolocation unavailable.
      }
    }, 100);
    return () => {
      clearTimeout(timer);
      try {
        map.removeControl(control);
      } catch {
        // Map gone.
      }
    };
  }, [map, followUserLocation]);

  return null;
});

/** Adds a source in the current style and re-adds it after every style swap; children see its id once it exists. */
const useWebSource = (id: string, build: () => SourceSpecification, deps: readonly unknown[]): boolean => {
  const map = useContext(WebMapContext);
  const revision = useStyleRevision();
  const [readyRevision, setReadyRevision] = useState(-1);
  const addToken = useRef(0);
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    if (!map) return undefined;
    const token = ++addToken.current;
    try {
      if (!map.getSource(id)) map.addSource(id, buildRef.current());
      setReadyRevision(revision);
    } catch (error) {
      warn(`Failed to add map source ${id}`, error);
    }
    return () => {
      setReadyRevision(-1);
      // Deferred so child layers are removed first; skipped when a newer add (style swap) claimed the id. Reading the
      // CURRENT token is the point, so the ref is read at timeout time on purpose.
      setTimeout(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (addToken.current === token) safeRemoveSource(map, id);
      }, 0);
    };
    // deps are the caller's source options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id, revision, ...deps]);

  return readyRevision === revision;
};

export function ShapeSource({ id, shape, onPress, cluster, clusterRadius, clusterMaxZoomLevel, children }: ShapeSourceProps) {
  const map = useContext(WebMapContext);
  const shapeRef = useRef(shape);
  shapeRef.current = shape;
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const ready = useWebSource(id, () => ({ type: 'geojson', data: shapeRef.current ?? EMPTY_COLLECTION, cluster, clusterRadius, clusterMaxZoom: clusterMaxZoomLevel }), [cluster, clusterRadius, clusterMaxZoomLevel]);

  useEffect(() => {
    if (!map || !ready) return;
    try {
      (map.getSource(id) as GLGeoJSONSource | undefined)?.setData(shape ?? EMPTY_COLLECTION);
    } catch {
      // Source mid-swap.
    }
  }, [map, id, shape, ready]);

  const hasPress = !!onPress;
  useEffect(() => {
    if (!map || !hasPress) return undefined;
    const handleClick = (event: MapMouseEvent): void => {
      const { x, y } = event.point;
      try {
        const features = map
          .queryRenderedFeatures([
            [x - 8, y - 8],
            [x + 8, y + 8],
          ])
          .filter((feature) => feature.source === id);
        if (features.length > 0) {
          onPressRef.current?.({ features: features as unknown as GeoJSON.Feature[], coordinates: [event.lngLat.lng, event.lngLat.lat], point: [x, y] });
        }
      } catch {
        // Style mid-swap.
      }
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, id, hasPress]);

  return <SourceContext.Provider value={ready ? id : null}>{children}</SourceContext.Provider>;
}

export function RasterSource({ id, tileUrlTemplates, tileSize = 256, minZoomLevel, maxZoomLevel, attribution, scheme, children }: RasterSourceProps) {
  const tilesKey = tileUrlTemplates.join('|');
  const ready = useWebSource(id, () => ({ type: 'raster', tiles: tileUrlTemplates, tileSize, minzoom: minZoomLevel, maxzoom: maxZoomLevel, attribution, scheme }), [
    tilesKey,
    tileSize,
    minZoomLevel,
    maxZoomLevel,
    attribution,
    scheme,
  ]);
  return <SourceContext.Provider value={ready ? id : null}>{children}</SourceContext.Provider>;
}

export function ImageSource({ id, url, coordinates, children }: ImageSourceProps) {
  const map = useContext(WebMapContext);
  const uri = resolveAssetUri(url) ?? '';
  const coordinatesKey = JSON.stringify(coordinates);
  const ready = useWebSource(id, () => ({ type: 'image', url: uri, coordinates }), [uri]);
  useEffect(() => {
    if (!map || !ready) return;
    try {
      (map.getSource(id) as GLImageSource | undefined)?.updateImage({ url: uri, coordinates });
    } catch {
      // Source mid-swap.
    }
    // coordinatesKey is the serialized coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id, uri, coordinatesKey, ready]);
  return <SourceContext.Provider value={ready ? id : null}>{children}</SourceContext.Provider>;
}

type AnyLayerProps = LineLayerProps | FillLayerProps | SymbolLayerProps | CircleLayerProps | HeatmapLayerProps | RasterLayerProps;

/** maplibre-gl inserts before a layer; "above X" means "before the layer after X". */
const resolveBeforeId = (map: GLMap, below?: string, above?: string): string | undefined => {
  if (below && map.getLayer(below)) return below;
  if (above) {
    const layers = map.getStyle()?.layers ?? [];
    const index = layers.findIndex((layer) => layer.id === above);
    if (index >= 0 && index + 1 < layers.length) return layers[index + 1].id;
  }
  return undefined;
};

const useWebLayer = (type: LayerType, props: AnyLayerProps): null => {
  const map = useContext(WebMapContext);
  const contextSource = useContext(SourceContext);
  const revision = useStyleRevision();
  const sourceId = props.sourceID ?? contextSource;
  const signature = styleSignature(props.style);
  // The signature captures the style object's content (inline style objects change identity every render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { paint, layout } = useMemo(() => toPaintAndLayout(type, props.style), [type, signature]);
  const filterKey = JSON.stringify(props.filter ?? null);
  const latest = useRef({ paint, layout, props });
  latest.current = { paint, layout, props };

  useEffect(() => {
    if (!map || !sourceId) return undefined;
    const current = latest.current;
    if (!map.getLayer(props.id)) {
      const spec: Record<string, unknown> = { id: props.id, type, source: sourceId, paint: current.paint, layout: current.layout };
      if (current.props.sourceLayerID) spec['source-layer'] = current.props.sourceLayerID;
      if (current.props.filter) spec.filter = current.props.filter;
      if (typeof current.props.minZoomLevel === 'number') spec.minzoom = current.props.minZoomLevel;
      if (typeof current.props.maxZoomLevel === 'number') spec.maxzoom = current.props.maxZoomLevel;
      try {
        map.addLayer(spec as unknown as LayerSpecification, resolveBeforeId(map, current.props.belowLayerID, current.props.aboveLayerID));
      } catch (error) {
        warn(`Failed to add map layer ${props.id}`, error);
      }
    }
    return () => safeRemoveLayer(map, props.id);
    // Re-added when the source (re)appears or the style revision changes; property updates go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sourceId, props.id, revision]);

  useEffect(() => {
    if (!map || !sourceId || !map.getLayer(props.id)) return;
    try {
      for (const [key, value] of Object.entries(paint)) map.setPaintProperty(props.id, key as Parameters<GLMap['setPaintProperty']>[1], value as Parameters<GLMap['setPaintProperty']>[2]);
      for (const [key, value] of Object.entries(layout)) map.setLayoutProperty(props.id, key as Parameters<GLMap['setLayoutProperty']>[1], value as Parameters<GLMap['setLayoutProperty']>[2]);
      map.setFilter(props.id, (props.filter ?? null) as FilterSpecification | null);
      map.setLayerZoomRange(props.id, props.minZoomLevel ?? 0, props.maxZoomLevel ?? 24);
    } catch {
      // Style mid-swap.
    }
    // filterKey is the serialized filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sourceId, props.id, paint, layout, filterKey, props.minZoomLevel, props.maxZoomLevel]);

  return null;
};

export function LineLayer(props: LineLayerProps) {
  return useWebLayer('line', props);
}

export function FillLayer(props: FillLayerProps) {
  return useWebLayer('fill', props);
}

export function SymbolLayer(props: SymbolLayerProps) {
  return useWebLayer('symbol', props);
}

export function CircleLayer(props: CircleLayerProps) {
  return useWebLayer('circle', props);
}

export function HeatmapLayer(props: HeatmapLayerProps) {
  return useWebLayer('heatmap', props);
}

export function RasterLayer(props: RasterLayerProps) {
  return useWebLayer('raster', props);
}

export function MarkerView({ id, coordinate, anchor, offset, onPress, testID, children }: MarkerViewProps) {
  const map = useContext(WebMapContext);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const namedAnchor = toNamedAnchor(anchor);
  const valid = isValidLngLat(coordinate);
  const lng = valid ? coordinate[0] : 0;
  const lat = valid ? coordinate[1] : 0;
  const latestPosition = useRef<LngLat>([lng, lat]);
  latestPosition.current = [lng, lat];

  // One DOM marker per id/anchor; coordinate changes move it.
  useEffect(() => {
    if (!map || !valid) return undefined;
    const container = document.createElement('div');
    container.style.cursor = 'pointer';
    if (testID) container.setAttribute('data-testid', testID);
    const handleClick = (event: MouseEvent): void => {
      event.stopPropagation();
      onPressRef.current?.();
    };
    container.addEventListener('click', handleClick);
    const { Marker } = maplibre();
    const marker = new Marker({ element: container, anchor: namedAnchor, offset }).setLngLat(latestPosition.current).addTo(map);
    markerRef.current = marker;
    setElement(container);
    return () => {
      container.removeEventListener('click', handleClick);
      marker.remove();
      markerRef.current = null;
      setElement(null);
    };
    // offset is fixed per marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id, namedAnchor, valid, testID]);

  useEffect(() => {
    if (valid) markerRef.current?.setLngLat([lng, lat]);
  }, [lng, lat, valid]);

  // A portal keeps the marker's React content inside the app's providers (theme, i18n).
  return element ? createPortal(<>{children}</>, element) : null;
}

/** rnmapbox `PointAnnotation` callers: same as `MarkerView` (`onSelected` → `onPress`). */
export function PointAnnotation({ onSelected, ...props }: MarkerViewProps & { onSelected?: () => void; title?: string }) {
  return <MarkerView {...props} onPress={props.onPress ?? onSelected} />;
}

const entryUri = (entry: MapImageEntry): { uri: string | null; sdf: boolean } => {
  if (typeof entry === 'string' || typeof entry === 'number') return { uri: resolveAssetUri(entry), sdf: false };
  if ('uri' in entry) return { uri: resolveAssetUri(entry), sdf: false };
  return { uri: resolveAssetUri(entry.source), sdf: !!entry.sdf };
};

export function Images({ images, onImageMissing }: ImagesProps) {
  const map = useContext(WebMapContext);
  const revision = useStyleRevision();
  const onMissingRef = useRef(onImageMissing);
  onMissingRef.current = onImageMissing;

  useEffect(() => {
    if (!map) return undefined;
    const added: string[] = [];
    // Image decoding is async: a late onload after cleanup must not leak the image into the style.
    let cancelled = false;
    for (const [name, entry] of Object.entries(images)) {
      const { uri, sdf } = entryUri(entry);
      if (!uri) continue;
      try {
        if (map.hasImage(name)) continue;
      } catch {
        continue;
      }
      const image = new window.Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          if (removedMaps.has(map) || cancelled) return;
          if (!map.hasImage(name)) {
            map.addImage(name, image, { sdf });
            added.push(name);
          }
        } catch {
          // Map gone or style mid-swap.
        }
      };
      image.src = uri;
    }
    return () => {
      cancelled = true;
      for (const name of added) {
        try {
          if (!removedMaps.has(map) && map.hasImage(name)) map.removeImage(name);
        } catch {
          // Ignore.
        }
      }
    };
  }, [map, images, revision]);

  useEffect(() => {
    if (!map) return undefined;
    const handleMissing = (event: MapStyleImageMissingEvent): void => onMissingRef.current?.(event.id);
    map.on('styleimagemissing', handleMissing);
    return () => {
      map.off('styleimagemissing', handleMissing);
    };
  }, [map]);

  return null;
}

export function UserLocation({ visible = true, showsAccuracy = true }: UserLocationProps) {
  const map = useContext(WebMapContext);
  useEffect(() => {
    if (!map || !visible) return undefined;
    const { GeolocateControl } = maplibre();
    const control = new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: showsAccuracy, showUserLocation: true });
    map.addControl(control);
    const timer = setTimeout(() => {
      try {
        control.trigger();
      } catch {
        // Geolocation unavailable.
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      try {
        map.removeControl(control);
      } catch {
        // Map gone.
      }
    };
  }, [map, visible, showsAccuracy]);
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    minHeight: 100,
    overflow: 'hidden',
  },
});
