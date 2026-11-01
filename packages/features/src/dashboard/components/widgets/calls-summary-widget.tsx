import { selectActiveCalls, useCallsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { ScrollView, Text, View } from '@resgrid/ui';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { useNow } from '../../hooks/use-now';
import { useStale } from '../../hooks/use-stale';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { mostRecentCall, summarizeCallPriorities } from '../../lib/board-data';
import { ELAPSED_KEYS, elapsedSince, normalizeColor } from '../../lib/format';
import { WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import { SummaryRow } from './summary-row';
import type { WidgetProps } from './types';

/**
 * Active calls in total and per priority (keyed by id; every department priority by default so a call on a custom
 * priority is never counted against a row that is not shown), plus the most recent call.
 */
export const CallsSummaryWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure }) => {
  const { t } = useTranslation();
  const title = useWidgetTitle(WidgetTypes.CALLS_SUMMARY);
  const calls = useCallsStore((state) => state.calls);
  const priorities = useCallsStore((state) => state.callPriorities);
  const isLoading = useCallsStore((state) => state.loading.calls === true);
  const hasError = useCallsStore((state) => !!state.errors.calls);
  const settings = useWidgetSettings('callsSummary');
  const now = useNow(60000, settings.showRecentCall);
  const active = useMemo(() => selectActiveCalls({ calls }), [calls]);
  const rows = useMemo(() => summarizeCallPriorities(active, priorities, settings), [active, priorities, settings]);
  const recent = useMemo(() => mostRecentCall(active), [active]);
  const recentElapsed = recent ? elapsedSince(recent.LoggedOnUtc, now) : null;
  const stale = useStale(active.length > 0, hasError);

  return (
    <WidgetContainer title={title} testID="calls-summary-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale}>
      {isLoading && active.length === 0 ? (
        <WidgetLoading testID="calls-summary-widget-loading" />
      ) : hasError && active.length === 0 ? (
        <WidgetMessage message={t('dashboard.failed_to_load')} tone="error" testID="calls-summary-widget-error" />
      ) : (
        <ScrollView style={styles.fill} nestedScrollEnabled>
          <SummaryRow label={t('dashboard.summary.active_calls')} value={active.length} fontSize={settings.fontSize} scale={2} testID="calls-summary-total" />
          {settings.showPriorityCounts
            ? rows.map(({ priority, count }) => (
                <SummaryRow key={priority.Id} label={priority.Name} value={count} fontSize={settings.fontSize} color={normalizeColor(priority.Color)} testID={`calls-summary-priority-${priority.Id}`} />
              ))
            : null}
          {settings.showRecentCall && recent ? (
            <View style={styles.recent} testID="calls-summary-recent">
              <Text className="text-typography-500" style={{ fontSize: Math.max(8, settings.fontSize - 2) }}>
                {t('dashboard.summary.most_recent')}
              </Text>
              <Text className="font-semibold text-typography-900" style={{ fontSize: settings.fontSize }} numberOfLines={1}>
                {recent.Number ? `#${recent.Number} ${recent.Name}` : recent.Name}
              </Text>
              {recentElapsed ? (
                <Text className="text-typography-500" style={{ fontSize: Math.max(8, settings.fontSize - 2) }}>
                  {t(ELAPSED_KEYS[recentElapsed.unit], { count: recentElapsed.count })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      )}
    </WidgetContainer>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  recent: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(107,114,128,0.3)' },
});
