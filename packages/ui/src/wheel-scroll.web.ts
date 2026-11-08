import type React from 'react';
import { useEffect } from 'react';
import type { ScrollView } from 'react-native';

/** How far a row must reach past its edge before a wheel turn moves it (matches the edge chevrons' tolerance). */
const WHEEL_OVERFLOW_TOLERANCE = 2;

/** `WheelEvent.deltaMode`: Firefox reports a mouse wheel in lines, a few browsers in pages. */
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;

/** Pixels per wheel line (the browsers' own line height for scrolling). */
const WHEEL_LINE_PX = 16;

/** A sideways scroller's position and size, as the DOM reports them. */
export interface WheelScrollPosition {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/** What a wheel turn moved, in the units `deltaMode` names. */
export interface WheelTurn {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}

/** The parts of a `WheelEvent` the row reads and cancels. */
export interface WheelInput extends WheelTurn {
  ctrlKey: boolean;
  defaultPrevented: boolean;
  preventDefault: () => void;
}

/** The parts of the row's scrolling DOM node the wheel handler uses (an `HTMLElement` has them all). */
export interface WheelScrollNode extends WheelScrollPosition {
  addEventListener(type: 'wheel', listener: (event: WheelInput) => void, options: AddEventListenerOptions): void;
  removeEventListener(type: 'wheel', listener: (event: WheelInput) => void): void;
}

const wheelPixels = (delta: number, deltaMode: number, pageWidth: number): number => {
  if (deltaMode === WHEEL_DELTA_LINE) return delta * WHEEL_LINE_PX;

  if (deltaMode === WHEEL_DELTA_PAGE) return delta * pageWidth;

  return delta;
};

/**
 * Where an up/down mouse wheel turned over a sideways row scrolls it, or null to leave the turn to the browser: a
 * sideways gesture (trackpad swipe, tilt wheel, Shift+wheel) that the browser already scrolls, a row with nothing past
 * its edges, and a row already at its end that way, so the page under it scrolls on.
 */
export const getWheelScrollLeft = ({ scrollLeft, scrollWidth, clientWidth }: WheelScrollPosition, { deltaX, deltaY, deltaMode }: WheelTurn): number | null => {
  if (deltaY === 0 || Math.abs(deltaX) >= Math.abs(deltaY)) return null;

  const maxLeft = scrollWidth - clientWidth;

  if (maxLeft <= WHEEL_OVERFLOW_TOLERANCE) return null;

  const next = Math.min(maxLeft, Math.max(0, scrollLeft + wheelPixels(deltaY, deltaMode, clientWidth)));

  return Math.abs(next - scrollLeft) < 1 ? null : next;
};

/** Lets a mouse wheel scroll a sideways row (see `getWheelScrollLeft`); returns the detach function. */
export const attachWheelScroll = (node: WheelScrollNode): (() => void) => {
  const onWheel = (event: WheelInput): void => {
    // Ctrl+wheel (and a trackpad pinch) zooms the page.
    if (event.ctrlKey || event.defaultPrevented) return;

    const left = getWheelScrollLeft(node, event);

    if (left === null) return;

    event.preventDefault();
    node.scrollLeft = left;
  };

  // Not passive, so the page does not scroll as well while the row takes the turn.
  node.addEventListener('wheel', onWheel, { passive: false });

  return () => node.removeEventListener('wheel', onWheel);
};

/**
 * Web and Electron: an up/down mouse wheel over a sideways tab strip or chip row scrolls it left and right. A mouse has
 * no other way to scroll a row whose scrollbar is hidden besides the edge chevrons; the row's scroll events then move
 * the chevrons as a swipe does.
 */
export function useWheelScrollsSideways(scrollViewRef: React.RefObject<React.ComponentRef<typeof ScrollView> | null>, enabled: boolean): void {
  useEffect(() => {
    // react-native-web hands out the scrolling DOM node itself as a ScrollView's ref.
    const node = scrollViewRef.current;

    if (!enabled || !(node instanceof HTMLElement)) return undefined;

    return attachWheelScroll(node);
  }, [enabled, scrollViewRef]);
}
