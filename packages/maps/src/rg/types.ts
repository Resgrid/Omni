import type { CircleLayerStyle, FillLayerStyle, FilterSpecification, HeatmapLayerStyle, LineLayerStyle, RasterLayerStyle, SymbolLayerStyle } from '@maplibre/maplibre-react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { CoordinateBounds, LngLat, MapStyle } from '../types';

/**
 * The `@resgrid/maps` wrapper API (MapLibre plan §8.1). It mirrors the subset of `@rnmapbox/maps` the legacy apps used,
 * so screens port by changing imports; `.native.tsx` renders it with `@maplibre/maplibre-react-native` and `.web.tsx`
 * with `maplibre-gl`. Attribution is always on and cannot be turned off (OSM ODbL and Mapbox terms).
 */

export type PixelPoint = [x: number, y: number];

export interface MapPressEvent {
  coordinates: LngLat;
  point: PixelPoint;
  /** rnmapbox compatibility: the press as a GeoJSON point. */
  geometry: { type: 'Point'; coordinates: LngLat };
}

export interface MapCameraChangedEvent {
  center: LngLat;
  zoom: number;
  heading: number;
  pitch: number;
  /** `[west, south, east, north]`, or null when the renderer cannot tell. */
  bounds: [number, number, number, number] | null;
  isUserInteraction: boolean;
  /** rnmapbox compatibility (`event.properties.isUserInteraction`). */
  properties: { isUserInteraction: boolean };
}

export type AttributionPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface MapViewProps {
  /** Style URL or JSON. Defaults to the department style from `MapProvider` (`useMapStyle`). */
  mapStyle?: MapStyle;
  /** rnmapbox name for `mapStyle` (URL only). */
  styleURL?: string;
  /** Bump to force every source, layer and image to be re-added (in addition to the automatic re-add after a style swap). */
  styleRevision?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
  compassEnabled?: boolean;
  zoomEnabled?: boolean;
  scrollEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  /** False turns every gesture off (static maps, thumbnails). */
  interactive?: boolean;
  /** Extra attribution text, appended to the style's own (web) — the provider's attribution is added automatically. */
  attribution?: string;
  attributionPosition?: AttributionPosition;
  /** Web only: where the map starts before a Camera moves it. */
  initialCenter?: LngLat;
  initialZoom?: number;
  onPress?: (event: MapPressEvent) => void;
  onLongPress?: (event: MapPressEvent) => void;
  onCameraChanged?: (event: MapCameraChangedEvent) => void;
  onDidFinishLoadingMap?: () => void;
  onDidFailLoadingMap?: () => void;
  /** Rendered instead of the map when there is no usable style (the provider found none). */
  unavailableFallback?: ReactNode;
}

export interface MapViewRef {
  getCenter(): Promise<LngLat | null>;
  getZoom(): Promise<number | null>;
  getVisibleBounds(): Promise<CoordinateBounds | null>;
}

export type CameraAnimationMode = 'flyTo' | 'easeTo' | 'linearTo' | 'moveTo' | 'none';
export type FollowUserMode = 'normal' | 'compass' | 'course';

export interface CameraPadding {
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
}

export interface CameraBounds extends CameraPadding {
  ne: LngLat;
  sw: LngLat;
}

export interface CameraSettings {
  centerCoordinate?: LngLat;
  zoomLevel?: number;
  heading?: number;
  pitch?: number;
}

export interface CameraProps extends CameraSettings {
  bounds?: CameraBounds;
  padding?: CameraPadding;
  animationDuration?: number;
  animationMode?: CameraAnimationMode;
  /** Initial placement only (later changes go through the other props or the ref). */
  defaultSettings?: CameraSettings;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  maxBounds?: CoordinateBounds;
  followUserLocation?: boolean;
  followUserMode?: FollowUserMode;
  followZoomLevel?: number;
  followPitch?: number;
  /** Called when the renderer stops (or starts) following the user, e.g. after a pan. */
  onUserTrackingModeChange?: (following: boolean) => void;
}

export interface CameraStopOptions extends CameraSettings {
  bounds?: CameraBounds;
  padding?: CameraPadding;
  animationDuration?: number;
  animationMode?: CameraAnimationMode;
}

export interface CameraRef {
  setCamera(options: CameraStopOptions): void;
  flyTo(coordinate: LngLat, animationDuration?: number): void;
  moveTo(coordinate: LngLat, animationDuration?: number): void;
  zoomTo(zoomLevel: number, animationDuration?: number): void;
  /** Padding: one number for all sides or `[top, right, bottom, left]`. */
  fitBounds(ne: LngLat, sw: LngLat, padding?: number | [number, number, number, number], animationDuration?: number): void;
}

export interface SourcePressEvent {
  features: GeoJSON.Feature[];
  coordinates: LngLat;
  point: PixelPoint;
}

export interface ShapeSourceProps {
  id: string;
  shape?: GeoJSON.GeoJSON | null;
  onPress?: (event: SourcePressEvent) => void;
  cluster?: boolean;
  clusterRadius?: number;
  clusterMaxZoomLevel?: number;
  /** Extra touch area around features, in points. */
  hitbox?: { width: number; height: number };
  children?: ReactNode;
}

export interface RasterSourceProps {
  id: string;
  tileUrlTemplates: string[];
  tileSize?: number;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  attribution?: string;
  scheme?: 'xyz' | 'tms';
  children?: ReactNode;
}

/** Image corners: top-left, top-right, bottom-right, bottom-left. */
export type ImageCoordinates = [LngLat, LngLat, LngLat, LngLat];

export interface ImageSourceProps {
  id: string;
  /** Remote URL (signed for server-hosted images — native sources cannot send auth headers) or a bundled asset. */
  url: string | number;
  coordinates: ImageCoordinates;
  children?: ReactNode;
}

interface BaseLayerProps<S> {
  id: string;
  style?: S;
  filter?: FilterSpecification;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  /** Source to draw from when the layer is not a child of a source component. */
  sourceID?: string;
  sourceLayerID?: string;
  belowLayerID?: string;
  aboveLayerID?: string;
  layerIndex?: number;
}

export type LineLayerProps = BaseLayerProps<LineLayerStyle>;
export type FillLayerProps = BaseLayerProps<FillLayerStyle>;
export type SymbolLayerProps = BaseLayerProps<SymbolLayerStyle>;
export type CircleLayerProps = BaseLayerProps<CircleLayerStyle>;
export type HeatmapLayerProps = BaseLayerProps<HeatmapLayerStyle>;
export type RasterLayerProps = BaseLayerProps<RasterLayerStyle>;

export type LayerType = 'line' | 'fill' | 'symbol' | 'circle' | 'heatmap' | 'raster';

/** Fractional `{x, y}` offset into the marker box (rnmapbox) or a named MapLibre anchor. */
export type MarkerAnchor = { x: number; y: number } | NamedAnchor;
export type NamedAnchor = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface MarkerViewProps {
  /** Stable id: keeps the native/DOM marker alive across coordinate updates. */
  id?: string;
  coordinate: LngLat;
  anchor?: MarkerAnchor;
  offset?: PixelPoint;
  /** Accepted for rnmapbox compatibility; MapLibre markers always overlap. */
  allowOverlap?: boolean;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
  children?: ReactNode;
}

/** A remote URL, a bundled asset (`require(...)`), `{ uri }`, or an SDF entry. */
export type MapImageEntry = string | number | { uri: string } | { source: string | number | { uri: string }; sdf?: boolean };

export interface ImagesProps {
  images: Record<string, MapImageEntry>;
  onImageMissing?: (name: string) => void;
}

export interface UserLocationProps {
  visible?: boolean;
  showsUserHeadingIndicator?: boolean;
  showsAccuracy?: boolean;
  minDisplacement?: number;
  onPress?: () => void;
}
