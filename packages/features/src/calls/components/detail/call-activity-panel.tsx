import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { DispatchedEventResultData } from '@resgrid/models';
import { Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface CallActivityPanelProps {
  activity: readonly DispatchedEventResultData[];
}

/** Server `StatusDestinationSources`: 1 Explicit; 2 CarryForward, 3 Dispatch, 4 Unit (auto-linked); 5 Inferred. */
export const activityLinkKind = (source: number | null | undefined): 'auto' | 'inferred' | null => {
  if (source === 2 || source === 3 || source === 4) return 'auto';
  if (source === 5) return 'inferred';
  return null;
};

/** The call's timeline (status changes tied to the call), marking statuses the sender did not attach explicitly (Dispatch marker). */
export const CallActivityPanel: React.FC<CallActivityPanelProps> = ({ activity }) => {
  const { t } = useTranslation();
  if (activity.length === 0) {
    return (
      <View style={styles.panel} testID="call-activity-panel">
        <Text className="text-typography-600">{t('call_detail.no_timeline')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.panel} testID="call-activity-panel">
      {activity.map((event, index) => {
        const link = activityLinkKind(event.DestinationSource);
        return (
          <View key={`${event.Id}-${event.Timestamp}-${index}`} style={StyleSheet.flatten([styles.row, { borderLeftColor: event.StatusColor || '#3B82F6' }])}>
            <View style={styles.titleRow}>
              <Text className="font-semibold" style={event.StatusColor ? { color: event.StatusColor } : undefined}>
                {event.StatusText}
              </Text>
              {link ? (
                <View style={styles.link} accessible accessibilityLabel={t(`call_detail.activity_link.${link}_hint`)} testID={`activity-link-${link}`}>
                  <Text size="xs" className="text-typography-600">
                    {t(`call_detail.activity_link.${link}`)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text size="sm" className="text-typography-600">
              {[event.Name, event.Group].filter(Boolean).join(' — ')}
            </Text>
            <Text size="xs" className="text-typography-500">
              {formatUtcInDepartmentTime(event.Timestamp, null, undefined, undefined, event.Timestamp)}
            </Text>
            {event.Note ? (
              <Text size="xs" className="text-typography-600">
                {event.Note}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  row: { borderLeftWidth: 4, paddingLeft: 10, paddingVertical: 4, marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  link: { marginLeft: 8, borderRadius: 6, borderWidth: 1, borderColor: '#D1D5DB', paddingHorizontal: 6 },
});
