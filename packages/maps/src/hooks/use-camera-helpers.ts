import { type RefObject, useCallback, useEffect, useRef } from 'react';

import { applyPitchHysteresis, applyZoomHysteresis, computeBounds, normalizeHeading, smoothSpeed, zoomForSpeed } from '../lib/camera';
import type { CameraRef } from '../rg/types';

export interface FitOptions {
  padding?: number | [number, number, number, number];
  duration?: number;
  /** Zoom used when every coordinate is the same point. */
  singlePointZoom?: number;
}

/** Returns `fit(coordinates)` that frames them (ignoring invalid ones); a single point is centred instead. */
export const useFitBounds = (cameraRef: RefObject<CameraRef | null>): ((coordinates: readonly (readonly number[] | null | undefined)[], options?: FitOptions) => boolean) =>
  useCallback(
    (coordinates, options = {}) => {
      const camera = cameraRef.current;
      const bounds = computeBounds(coordinates);
      if (!camera || !bounds) return false;
      if (bounds.single) {
        camera.setCamera({ centerCoordinate: bounds.single, zoomLevel: options.singlePointZoom ?? 15, animationDuration: options.duration ?? 800 });
      } else {
        camera.fitBounds(bounds.ne, bounds.sw, options.padding ?? 60, options.duration ?? 800);
      }
      return true;
    },
    [cameraRef]
  );

export interface FollowPosition {
  latitude: number;
  longitude: number;
  heading?: number | null;
  /** Ground speed m/s (-1 / null when unknown). */
  speed?: number | null;
}

/**
 * Follow-the-unit camera (baseline Unit lib/map-camera): zoom from smoothed speed with hysteresis, navigation tilt
 * while moving, bearing from heading. Does nothing while `enabled` is false (the user unlocked the map).
 */
export const useFollowCamera = (cameraRef: RefObject<CameraRef | null>, position: FollowPosition | null, enabled: boolean, animationDuration = 1000): void => {
  const speedRef = useRef<number | null>(null);
  const zoomRef = useRef<number | null>(null);
  const pitchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      speedRef.current = null;
      zoomRef.current = null;
      pitchRef.current = null;
    }
  }, [enabled]);

  const latitude = position?.latitude;
  const longitude = position?.longitude;
  const heading = position?.heading;
  const speed = position?.speed;
  useEffect(() => {
    const camera = cameraRef.current;
    if (!enabled || !camera || typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const smoothed = smoothSpeed(speedRef.current, speed ?? 0);
    speedRef.current = smoothed;
    const zoom = applyZoomHysteresis(zoomRef.current, zoomForSpeed(smoothed));
    zoomRef.current = zoom;
    const pitch = applyPitchHysteresis(pitchRef.current, smoothed);
    pitchRef.current = pitch;
    const bearing = normalizeHeading(heading);
    camera.setCamera({ centerCoordinate: [longitude, latitude], zoomLevel: zoom, pitch, heading: bearing ?? undefined, animationDuration, animationMode: 'easeTo' });
  }, [cameraRef, enabled, latitude, longitude, heading, speed, animationDuration]);
};
