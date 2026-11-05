import React from 'react';
import { type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView as RNScrollView, type ScrollViewProps, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { EdgeChevrons, useEdgeScroll } from './edge-scroll';
import { useTranslation } from './utils/i18n';

export interface ScrollRowProps extends Omit<ScrollViewProps, 'horizontal' | 'style'> {
  /** The row's box: margins, or `flexGrow: 1, flexShrink: 1` to fill what is left beside other items in a row. */
  style?: StyleProp<ViewStyle>;
  /** Classes for the row's box (margins). */
  className?: string;
  /** Round chevrons at an edge that has more past it (default on). */
  showOverflowIndicators?: boolean;
  /** The row's box; the scroller adds `-scroll-view`, the chevrons `-left-overflow` and `-right-overflow`. */
  testID?: string;
}

/**
 * A sideways-scrolling row of chips, filters or choices. It keeps its content's height (a horizontal scroller given
 * room to grow took half a screen, or was squeezed to nothing above a full-height list), and shows a small round
 * chevron at each edge that has more chips past it, so a phone never hides choices without a hint; a chevron pages
 * the row that way. Tab rows use `TabBar`.
 */
export const ScrollRow: React.FC<ScrollRowProps> = ({ children, style, className, showOverflowIndicators = true, testID = 'scroll-row', onLayout, onContentSizeChange, onScroll, ...props }) => {
  const { t } = useTranslation();
  const edge = useEdgeScroll();

  const handleLayout = (event: LayoutChangeEvent) => {
    edge.onLayout(event);
    onLayout?.(event);
  };

  const handleContentSizeChange = (width: number, height: number) => {
    edge.onContentSizeChange(width);
    onContentSizeChange?.(width, height);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    edge.onScroll(event);
    onScroll?.(event);
  };

  return (
    <View style={StyleSheet.flatten([styles.row, style])} className={className} testID={testID}>
      <RNScrollView
        ref={edge.scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        style={styles.scroller}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        testID={`${testID}-scroll-view`}
        {...props}
      >
        {children}
      </RNScrollView>

      {showOverflowIndicators ? (
        <EdgeChevrons
          overflow={edge.overflow}
          onPage={edge.page}
          appearance="button"
          leftLabel={t('common.scroll_left', { defaultValue: 'Scroll left' })}
          rightLabel={t('common.scroll_right', { defaultValue: 'Scroll right' })}
          testID={testID}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  // Content height, never more or less; the scroller inside fills the row's width.
  row: { position: 'relative', flexGrow: 0, flexShrink: 0 },
  scroller: { width: '100%', flexGrow: 0 },
});
