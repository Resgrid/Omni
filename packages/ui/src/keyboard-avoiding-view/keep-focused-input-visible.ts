'use client';

import { type ComponentRef, useCallback, useEffect, useRef } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView, TextInput } from 'react-native';
import { KeyboardEvents } from 'react-native-keyboard-controller';

/** Space kept between a revealed field and the edge of the scroll view around it. */
export const FOCUSED_INPUT_MARGIN = 16;

export interface VerticalSpan {
  top: number;
  height: number;
}

/**
 * How far a scroll view has to scroll so `target` shows inside `viewport` with `margin` to spare. Both spans are
 * measured in the same window. Positive scrolls the content up (the field sits below the visible area), negative scrolls
 * it down, 0 means the field already shows. A field taller than the viewport lines up its top edge.
 */
export const focusedInputScrollDelta = (viewport: VerticalSpan, target: VerticalSpan, margin = FOCUSED_INPUT_MARGIN): number => {
  const startsAbove = target.top - margin - viewport.top;
  const endsBelow = target.top + target.height + margin - (viewport.top + viewport.height);

  if (target.height + margin * 2 > viewport.height) return startsAbove;

  if (endsBelow > 0) return endsBelow;

  return startsAbove < 0 ? startsAbove : 0;
};

/**
 * Keeps the focused text field visible in a scroll view that sits *on top of* the keyboard: a bottom sheet lifted by
 * `BottomAnchoredKeyboardView`. Lifting the sheet makes it shorter, so a note at the end of its content can end up below
 * the visible part of its scroll view. Once the keyboard is up (or switches fields), this scrolls the field into view.
 *
 * Give that ScrollView `scrollRef` as its `ref`, and `onScroll` and `scrollEventThrottle` as props. A ScrollView that runs
 * behind the keyboard needs `KeyboardAwareScrollView` instead, which also makes room under the last field.
 */
export function useKeepFocusedInputVisible(enabled = true) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsetRef = useRef(0);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    let frame: number | null = null;

    const reveal = () => {
      frame = null;
      const input = TextInput.State.currentlyFocusedInput();
      const scrollView = scrollRef.current;

      if (!input || !scrollView) return;

      scrollView.measureInWindow((_x, top, _width, height) => {
        input.measureInWindow((_inputX, targetTop, _inputWidth, targetHeight) => {
          const delta = focusedInputScrollDelta({ top, height }, { top: targetTop, height: targetHeight });

          if (Math.abs(delta) >= 1) scrollView.scrollTo({ y: Math.max(0, offsetRef.current + delta), animated: true });
        });
      });
    };

    // `keyboardDidShow` fires once the keyboard (and so the lift) has settled, and again when the focus moves to a field
    // with a different keyboard. Measuring a frame later reads the layout the lift committed.
    const subscription = KeyboardEvents.addListener('keyboardDidShow', () => {
      if (frame !== null) cancelAnimationFrame(frame);

      frame = requestAnimationFrame(reveal);
    });

    return () => {
      subscription.remove();

      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return { scrollRef, onScroll, scrollEventThrottle: 16 } as const;
}
