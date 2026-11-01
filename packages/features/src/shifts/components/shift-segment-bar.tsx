import { useTranslation } from '@resgrid/i18n';
import { Box, Pressable, Text } from '@resgrid/ui';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import type { ShiftView } from '../lib/shift-loaders';

export interface ShiftSegment {
  key: ShiftView;
  label: string;
  /** Count next to the label (pending approvals, trades the caller can take); hidden at 0. */
  badge?: number;
}

export interface ShiftSegmentBarProps {
  segments: readonly ShiftSegment[];
  active: ShiftView;
  onChange: (key: ShiftView) => void;
}

/** Horizontally scrolling pill tabs: all fit on a tablet, and scroll rather than squash on a phone. */
export const ShiftSegmentBar: React.FC<ShiftSegmentBarProps> = ({ segments, active, onChange }) => {
  const { t } = useTranslation();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content} accessibilityRole="tablist" testID="shifts-segment-bar">
      {segments.map((segment) => {
        const isActive = segment.key === active;
        const badge = segment.badge ?? 0;
        return (
          <Pressable
            key={segment.key}
            onPress={() => onChange(segment.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={badge > 0 ? t('shifts.segments.with_count', { label: segment.label, count: badge }) : segment.label}
            accessibilityHint={t('shifts.segments.a11y_hint')}
            testID={`shifts-segment-${segment.key}`}
            className={`mr-2 min-h-[40px] flex-row items-center rounded-full border px-4 py-2 ${isActive ? 'border-primary-600 bg-primary-600' : 'border-outline-300 bg-background-0'}`}
          >
            <Text size="sm" className={`font-medium ${isActive ? 'text-typography-0' : 'text-typography-800'}`}>
              {segment.label}
            </Text>
            {badge > 0 ? (
              <Box className={`ml-2 min-w-[20px] items-center rounded-full px-1.5 ${isActive ? 'bg-background-0' : 'bg-error-600'}`} testID={`shifts-segment-badge-${segment.key}`}>
                <Text size="xs" className={`font-bold ${isActive ? 'text-typography-800' : 'text-typography-0'}`}>
                  {badge}
                </Text>
              </Box>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
});
