// Pure zoom math for ImageViewer, kept apart from the gesture wiring so it can be tested without touches.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Zoom a double tap goes to from the fitted picture (and back). */
export const DOUBLE_TAP_ZOOM = 2.5;

/** Two taps closer together than this are a double tap. */
export const DOUBLE_TAP_MS = 300;

/** A touch that moves less than this (in points) is a tap, not a drag. */
export const TAP_SLOP = 10;

export interface TouchPoint {
  pageX: number;
  pageY: number;
}

export const clampZoom = (scale: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));

/** Distance between the first two touches; 0 with fewer than two. */
export const touchDistance = (touches: readonly TouchPoint[]): number => {
  const [first, second] = touches;

  return first && second ? Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY) : 0;
};

/**
 * Keeps a scaled picture's offset inside its frame: at zoom `scale` a frame of `size` points can move at most half the
 * extra size either way, and not at all when the picture is not zoomed in.
 */
export const clampOffset = (offset: number, size: number, scale: number): number => {
  const limit = Math.max(0, (size * (scale - 1)) / 2);

  return Math.min(limit, Math.max(-limit, offset));
};
