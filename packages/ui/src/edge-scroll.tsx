import React, { useCallback, useRef, useState } from 'react';
import { type ColorValue, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, type ScrollView, StyleSheet, View } from 'react-native';

import { ChevronLeft, ChevronRight } from './lucide-icons';
import { useThemeColors } from './theme/use-theme-colors';

/** What a sideways scroller knows about itself: its content, where it is scrolled to and how much of it shows. */
export interface EdgeScrollMetrics {
  contentWidth: number;
  offsetX: number;
  viewportWidth: number;
}

export interface EdgeOverflow {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

export type EdgeDirection = -1 | 1;

export interface EdgeScroll {
  scrollViewRef: React.RefObject<React.ComponentRef<typeof ScrollView> | null>;
  /** Kept current by the handlers below. */
  metricsRef: React.RefObject<EdgeScrollMetrics>;
  /** Which edges have content past them. */
  overflow: EdgeOverflow;
  onLayout: (event: LayoutChangeEvent) => void;
  onContentSizeChange: (contentWidth: number) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Scroll about one visible width towards a side (what an edge chevron does). */
  page: (direction: EdgeDirection) => void;
}

const OVERFLOW_TOLERANCE = 2;

/** Width of an edge chevron; a page leaves room for both, so the item cut off at an edge lands fully in view. */
export const EDGE_CHEVRON_WIDTH = 28;

/** Where a chevron press scrolls: one visible width less both chevrons, never less than half of it (a narrow row would crawl). */
export const getEdgeScrollTarget = ({ contentWidth, offsetX, viewportWidth }: EdgeScrollMetrics, direction: EdgeDirection): number => {
  const page = Math.max(viewportWidth - 2 * EDGE_CHEVRON_WIDTH, viewportWidth / 2);
  const maxOffset = Math.max(0, contentWidth - viewportWidth);

  return Math.min(maxOffset, Math.max(0, offsetX + direction * page));
};

/**
 * Tracks a horizontal ScrollView (attach `scrollViewRef` and the three handlers) and reports which edges hide
 * content, so a tab bar or chip row can show a chevron there: a row cut off at the screen edge gave no other hint.
 */
export function useEdgeScroll(): EdgeScroll {
  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const metricsRef = useRef<EdgeScrollMetrics>({ contentWidth: 0, offsetX: 0, viewportWidth: 0 });
  const [overflow, setOverflow] = useState<EdgeOverflow>({ canScrollLeft: false, canScrollRight: false });

  const update = useCallback(() => {
    const { contentWidth, offsetX, viewportWidth } = metricsRef.current;

    const next = {
      canScrollLeft: offsetX > OVERFLOW_TOLERANCE,
      canScrollRight: contentWidth - viewportWidth - offsetX > OVERFLOW_TOLERANCE,
    };

    setOverflow((current) => (current.canScrollLeft === next.canScrollLeft && current.canScrollRight === next.canScrollRight ? current : next));
  }, []);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      metricsRef.current.viewportWidth = event.nativeEvent.layout.width;
      update();
    },
    [update]
  );

  const onContentSizeChange = useCallback(
    (contentWidth: number) => {
      metricsRef.current.contentWidth = contentWidth;
      update();
    },
    [update]
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      metricsRef.current.offsetX = Math.max(0, event.nativeEvent.contentOffset.x);
      update();
    },
    [update]
  );

  // The scroll events this animates update the offset and the chevrons, as a swipe does.
  const page = useCallback((direction: EdgeDirection) => {
    scrollViewRef.current?.scrollTo({ x: getEdgeScrollTarget(metricsRef.current, direction), animated: true });
  }, []);

  return { scrollViewRef, metricsRef, overflow, onLayout, onContentSizeChange, onScroll, page };
}

export interface EdgeChevronsProps {
  overflow: EdgeOverflow;
  onPage: (direction: EdgeDirection) => void;
  /**
   * `strip`: a full-height band in `stripColor`, for a bar that draws its own surface (TabBar). `button`: a small round
   * button that reads on any background, for chip rows sitting on a page, card or sheet.
   */
  appearance: 'strip' | 'button';
  stripColor?: ColorValue;
  leftLabel: string;
  rightLabel: string;
  /** Prefix: the chevrons are `<testID>-left-overflow` and `<testID>-right-overflow`. */
  testID: string;
}

/** The left and right chevrons over a sideways scroller; render inside a `position: relative` box around it. */
export const EdgeChevrons: React.FC<EdgeChevronsProps> = ({ overflow, onPage, appearance, stripColor, leftLabel, rightLabel, testID }) => {
  const colors = useThemeColors();

  const renderChevron = (direction: EdgeDirection) => {
    const isLeft = direction === -1;
    const Icon = isLeft ? ChevronLeft : ChevronRight;
    const side = isLeft ? styles.left : styles.right;
    const label = isLeft ? leftLabel : rightLabel;
    const id = `${testID}-${isLeft ? 'left' : 'right'}-overflow`;

    if (appearance === 'strip') {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => onPage(direction)}
          testID={id}
          style={StyleSheet.flatten([styles.strip, side, { backgroundColor: stripColor ?? colors.token('background-0', 0.95) }])}
        >
          <Icon size={20} color={colors.icon} />
        </Pressable>
      );
    }

    // The band is only a positioning box: taps beside the round button reach the chip under it.
    return (
      <View pointerEvents="box-none" style={StyleSheet.flatten([styles.band, side])}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => onPage(direction)}
          hitSlop={8}
          testID={id}
          style={StyleSheet.flatten([styles.button, { backgroundColor: colors.background, borderColor: colors.borderStrong }])}
        >
          <Icon size={16} color={colors.icon} />
        </Pressable>
      </View>
    );
  };

  return (
    <>
      {overflow.canScrollLeft ? renderChevron(-1) : null}
      {overflow.canScrollRight ? renderChevron(1) : null}
    </>
  );
};

const styles = StyleSheet.create({
  strip: { position: 'absolute', top: 0, bottom: 0, width: EDGE_CHEVRON_WIDTH, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  band: { position: 'absolute', top: 0, bottom: 0, width: EDGE_CHEVRON_WIDTH, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  button: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  left: { left: 0 },
  right: { right: 0 },
});
