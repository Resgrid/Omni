import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { DispatcherCoverageResultData } from '@resgrid/models';
import { HStack, pickResponsive, Pressable, ScrollRow, Text, useFormFactor } from '@resgrid/ui';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { buildCoverageTimeline, type CoverageTimeline, instantOffset, segmentBox, type TimelineSegment } from '../lib/coverage-timeline';
import { breakTypeLabelKey } from '../lib/desk-format';

const ROW_HEIGHT = 40;
const NAME_WIDTH = { phone: 96, tablet: 140 } as const;
const HOUR_WIDTH = { phone: 64, tablet: 96 } as const;
const HOUR_LABEL: Intl.DateTimeFormatOptions = { hour: 'numeric' };

export interface CoverageTimelineViewProps {
  coverage: DispatcherCoverageResultData;
  now: number;
  /** Supervisors: a dispatcher's row opens their breaks. */
  onPressRow?: (userId: string, name: string) => void;
  testID?: string;
}

/** Stripes across a span: the timeline's hatching for overlapping breaks (no pattern fills on every platform). */
const Hatching: React.FC<{ width: number }> = ({ width }) => (
  <View style={styles.hatching} pointerEvents="none">
    {Array.from({ length: Math.max(1, Math.floor(width / 6)) }, (_, index) => (
      <View key={index} style={StyleSheet.flatten([styles.stripe, { left: index * 6 }])} />
    ))}
  </View>
);

const Lane: React.FC<{ spans: TimelineSegment[]; timeline: CoverageTimeline; width: number; className: string; hatched?: boolean; testID: string }> = ({ spans, timeline, width, className, hatched = false, testID }) => (
  <>
    {spans.map((span) => {
      const box = segmentBox(span, timeline, width);

      return (
        <View key={`${testID}-${span.startMs}`} className={`absolute bottom-1 top-1 rounded-sm ${className}`} style={{ left: box.left, width: box.width }} testID={testID}>
          {hatched ? <Hatching width={box.width} /> : null}
        </View>
      );
    })}
  </>
);

/**
 * Today's dispatch timeline for everyone (plan D11): a row per dispatcher with their duty window and breaks — planned as
 * an outline, taken solid, overdue red — over the coverage lane, red where fewer than the minimum are available and
 * hatched where breaks overlap, with the current time marked. Scrolls sideways; the names stay put.
 */
export const CoverageTimelineView: React.FC<CoverageTimelineViewProps> = ({ coverage, now, onPressRow, testID = 'desk-coverage-timeline' }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const { formFactor } = useFormFactor();
  const timeline = useMemo(() => buildCoverageTimeline(coverage, now), [coverage, now]);
  const nameWidth = pickResponsive(formFactor, NAME_WIDTH);
  const hourWidth = pickResponsive(formFactor, HOUR_WIDTH);
  const width = Math.max(1, ((timeline.endMs - timeline.startMs) / 3600000) * hourWidth);
  const nowOffset = now >= timeline.startMs && now <= timeline.endMs ? instantOffset(now, timeline, width) : null;

  // The day starts at midnight, so the row opens two hours before now (else before the first duty), not on an empty night.
  const firstDutyLeft = timeline.rows
    .flatMap((row) => row.duty)
    .reduce<number | null>((min, duty) => {
      const left = segmentBox(duty, timeline, width).left;

      return min === null || left < min ? left : min;
    }, null);

  const initialScrollX = Math.max(0, (nowOffset ?? firstDutyLeft ?? 0) - hourWidth * 2);

  return (
    <View testID={testID}>
      <HStack>
        <View style={{ width: nameWidth }}>
          <View style={styles.scaleRow} />
          <View style={styles.row} className="justify-center pr-2">
            <Text size="xs" className="font-semibold text-typography-700" numberOfLines={1}>
              {t('dispatcher_desk.timeline.coverage')}
            </Text>
          </View>
          {timeline.rows.map((row) => (
            <Pressable
              key={row.userId}
              onPress={onPressRow ? () => onPressRow(row.userId, row.name) : undefined}
              disabled={!onPressRow}
              accessibilityRole={onPressRow ? 'button' : 'text'}
              accessibilityLabel={row.name}
              style={styles.row}
              className="justify-center pr-2"
              testID={`${testID}-name-${row.userId}`}
            >
              <Text size="sm" className={`font-medium ${onPressRow ? 'text-primary-700' : 'text-typography-900'}`} numberOfLines={1}>
                {row.name}
              </Text>
            </Pressable>
          ))}
        </View>
        {/* ScrollRow fills the width beside the names through its style: a flex-1 class loses to its own content-width style. */}
        <ScrollRow style={styles.scroller} initialScrollX={initialScrollX} testID={`${testID}-scroll`}>
          <View style={{ width }}>
            <View style={styles.scaleRow}>
              {timeline.hourTicks.map((tick) => (
                <Text key={tick} size="xs" className="absolute text-typography-500" style={{ left: instantOffset(tick, timeline, width) + 2 }}>
                  {formatUtcInDepartmentTime(new Date(tick).toISOString(), timeZone, HOUR_LABEL)}
                </Text>
              ))}
            </View>
            <View style={styles.row} className="rounded bg-success-50" testID={`${testID}-coverage-lane`}>
              <Lane spans={timeline.belowMinimum} timeline={timeline} width={width} className="bg-error-500" testID={`${testID}-below-minimum`} />
              <Lane spans={timeline.overlaps} timeline={timeline} width={width} className="border border-warning-500" hatched testID={`${testID}-overlap`} />
            </View>
            {timeline.rows.map((row) => (
              <View key={row.userId} style={styles.row} className="border-b border-outline-100" testID={`${testID}-row-${row.userId}`}>
                {row.duty.map((duty) => {
                  const box = segmentBox(duty, timeline, width);

                  return <View key={`duty-${duty.startMs}`} className="absolute bottom-2 top-2 rounded bg-primary-100" style={{ left: box.left, width: box.width }} testID={`${testID}-duty-${row.userId}`} />;
                })}
                {row.breaks.map((entry) => {
                  const box = segmentBox(entry, timeline, width);
                  const tone = entry.overdue ? 'bg-error-500' : entry.taken ? 'bg-warning-500' : 'border-2 border-warning-500 bg-background-0';

                  return (
                    <View
                      key={entry.breakEntry.DispatcherBreakId}
                      className={`absolute bottom-1 top-1 justify-center overflow-hidden rounded px-1 ${tone}`}
                      style={{ left: box.left, width: box.width }}
                      accessibilityLabel={`${row.name}: ${t(breakTypeLabelKey(entry.breakEntry.BreakType))}`}
                      testID={`${testID}-break-${entry.breakEntry.DispatcherBreakId}${entry.overdue ? '-overdue' : entry.taken ? '-taken' : '-planned'}`}
                    >
                      {box.width > 40 ? (
                        <Text size="2xs" className={entry.taken || entry.overdue ? 'text-typography-0' : 'text-warning-800'} numberOfLines={1}>
                          {t(breakTypeLabelKey(entry.breakEntry.BreakType))}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
            {nowOffset !== null ? <View pointerEvents="none" className="absolute bottom-0 w-0.5 bg-error-600" style={{ left: nowOffset, top: 18 }} testID={`${testID}-now`} /> : null}
          </View>
        </ScrollRow>
      </HStack>
      {timeline.rows.length === 0 ? (
        <Text size="sm" className="mt-2 text-typography-500" testID={`${testID}-empty`}>
          {t('dispatcher_desk.timeline.empty')}
        </Text>
      ) : null}
      <HStack space="md" className="mt-2 flex-wrap">
        <Legend className="bg-primary-100" label={t('dispatcher_desk.timeline.legend_duty')} />
        <Legend className="border-2 border-warning-500" label={t('dispatcher_desk.timeline.legend_planned')} />
        <Legend className="bg-warning-500" label={t('dispatcher_desk.timeline.legend_taken')} />
        {/* An overdue break is drawn red like the below-minimum stretch of the coverage lane: both are "needs attention now". */}
        <Legend className="bg-error-500" label={t('dispatcher_desk.timeline.legend_overdue')} />
        <Legend className="bg-error-500" label={t('dispatcher_desk.timeline.legend_below')} />
      </HStack>
    </View>
  );
};

const Legend: React.FC<{ className: string; label: string }> = ({ className, label }) => (
  <HStack space="xs" className="mb-1 items-center">
    <View className={`h-3 w-5 rounded-sm ${className}`} />
    <Text size="xs" className="text-typography-600">
      {label}
    </Text>
  </HStack>
);

const styles = StyleSheet.create({
  scaleRow: { height: 18 },
  scroller: { flexGrow: 1, flexShrink: 1 },
  row: { height: ROW_HEIGHT },
  hatching: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' },
  stripe: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(217,119,6,0.55)' },
});
