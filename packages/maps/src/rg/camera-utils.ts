import { isValidLngLat, type LngLat } from '../types';
import type { CameraAnimationMode, CameraBounds, CameraPadding, CameraProps, CameraSettings, FollowUserMode, MarkerAnchor, NamedAnchor } from './types';

/** Pure conversions shared by the native and web renderers (and tested once). */

export interface EdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type Easing = 'fly' | 'ease' | 'linear' | undefined;

/** rnmapbox `{ paddingTop, … }` → `{ top, … }`; missing sides use `fallback`. */
export const toEdgePadding = (padding: CameraPadding | null | undefined, fallback = 0): EdgePadding => ({
  top: padding?.paddingTop ?? fallback,
  right: padding?.paddingRight ?? fallback,
  bottom: padding?.paddingBottom ?? fallback,
  left: padding?.paddingLeft ?? fallback,
});

/** `fitBounds` padding: one number for every side or `[top, right, bottom, left]`. */
export const paddingFromArgument = (padding: number | [number, number, number, number] | undefined, fallback = 40): EdgePadding => {
  if (Array.isArray(padding)) {
    return { top: padding[0] ?? fallback, right: padding[1] ?? fallback, bottom: padding[2] ?? fallback, left: padding[3] ?? fallback };
  }
  const value = typeof padding === 'number' && Number.isFinite(padding) ? padding : fallback;
  return { top: value, right: value, bottom: value, left: value };
};

/** rnmapbox animation modes → MapLibre easing. `moveTo` / `none` jump (no easing). */
export const toEasing = (mode: CameraAnimationMode | undefined): Easing => {
  switch (mode) {
    case 'flyTo':
      return 'fly';
    case 'linearTo':
      return 'linear';
    case 'moveTo':
    case 'none':
      return undefined;
    default:
      return 'ease';
  }
};

export const isJumpMode = (mode: CameraAnimationMode | undefined, duration: number | undefined): boolean => mode === 'moveTo' || mode === 'none' || duration === 0;

export const toTrackUserLocation = (follow: boolean | undefined, mode: FollowUserMode | undefined): 'default' | 'heading' | 'course' | undefined => {
  if (!follow) {
    return undefined;
  }
  if (mode === 'compass') return 'heading';
  if (mode === 'course') return 'course';
  return 'default';
};

const finiteOrUndefined = (value: number | undefined): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

export const validBounds = (bounds: CameraBounds | null | undefined): bounds is CameraBounds => !!bounds && isValidLngLat(bounds.ne) && isValidLngLat(bounds.sw);

/** A camera position with invalid values (NaN, out of range) removed, so the renderer never receives them. */
export interface CameraTarget {
  center?: LngLat;
  bounds?: [number, number, number, number];
  zoom?: number;
  bearing?: number;
  pitch?: number;
  padding?: EdgePadding;
  duration?: number;
  easing: Easing;
}

/**
 * The declarative camera target for the current props. Following the user drops the center (the renderer tracks the
 * device) and applies `followZoomLevel` / `followPitch`; bounds win over a center.
 */
export const toCameraTarget = (props: CameraProps): CameraTarget => {
  const following = !!props.followUserLocation;
  const target: CameraTarget = {
    zoom: finiteOrUndefined(following ? (props.followZoomLevel ?? props.zoomLevel) : props.zoomLevel),
    bearing: finiteOrUndefined(props.heading),
    pitch: finiteOrUndefined(following ? (props.followPitch ?? props.pitch) : props.pitch),
    duration: isJumpMode(props.animationMode, props.animationDuration) ? 0 : finiteOrUndefined(props.animationDuration),
    easing: toEasing(props.animationMode),
  };
  if (props.padding) {
    target.padding = toEdgePadding(props.padding);
  }
  if (following) {
    return target;
  }
  if (validBounds(props.bounds)) {
    target.bounds = [props.bounds.sw[0], props.bounds.sw[1], props.bounds.ne[0], props.bounds.ne[1]];
    target.padding = toEdgePadding(props.bounds, 40);
    target.zoom = undefined;
    return target;
  }
  if (isValidLngLat(props.centerCoordinate)) {
    target.center = [props.centerCoordinate[0], props.centerCoordinate[1]];
  }
  return target;
};

/** Initial camera from `defaultSettings`, falling back to the first declarative center. */
export const toInitialView = (props: CameraProps): { center: LngLat; zoom?: number; bearing?: number; pitch?: number } | null => {
  const settings: CameraSettings | undefined = props.defaultSettings;
  const center = settings?.centerCoordinate ?? props.centerCoordinate;
  if (!isValidLngLat(center)) {
    return null;
  }
  return {
    center: [center[0], center[1]],
    zoom: finiteOrUndefined(settings?.zoomLevel ?? props.zoomLevel),
    bearing: finiteOrUndefined(settings?.heading ?? props.heading),
    pitch: finiteOrUndefined(settings?.pitch ?? props.pitch),
  };
};

/**
 * Native anchors are fractional `{x, y}` offsets into the marker box; MapLibre takes a named anchor. Values within a
 * quarter of an edge snap to it (`{ x: 0.5, y: 1 }` → `bottom`, the usual pin tip).
 */
export const toNamedAnchor = (anchor: MarkerAnchor | undefined): NamedAnchor => {
  if (typeof anchor === 'string') {
    return anchor;
  }
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    return 'center';
  }
  const vertical = anchor.y >= 0.75 ? 'bottom' : anchor.y <= 0.25 ? 'top' : '';
  const horizontal = anchor.x >= 0.75 ? 'right' : anchor.x <= 0.25 ? 'left' : '';
  if (vertical && horizontal) {
    return `${vertical}-${horizontal}` as NamedAnchor;
  }
  return (vertical || horizontal || 'center') as NamedAnchor;
};
