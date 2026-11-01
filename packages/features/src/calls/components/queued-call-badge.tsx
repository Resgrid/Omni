import type { LocalCallMarker } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Text } from '@resgrid/ui';
import { CloudOff, TriangleAlert } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export const QUEUED_CALL_COLORS = {
  queued: { background: '#FEF3C7', border: '#D97706', text: '#78350F' },
  rejected: { background: '#FEE2E2', border: '#DC2626', text: '#7F1D1D' },
} as const;

export interface QueuedCallBadgeProps {
  marker: LocalCallMarker;
  testID?: string;
}

/**
 * Plan §8.5: a call created on this device that the server has not accepted is shown everywhere as
 * **"Queued — not dispatched yet"** in a distinct colour (nobody has been paged); a refused one as
 * "Rejected — needs correction" until it is corrected or discarded in Pending sync.
 */
export const QueuedCallBadge: React.FC<QueuedCallBadgeProps> = ({ marker, testID = 'queued-call-badge' }) => {
  const { t } = useTranslation();
  const colors = QUEUED_CALL_COLORS[marker.state];
  const label = marker.state === 'rejected' ? t('calls.queued.rejected_badge') : t('calls.queued.badge');
  return (
    <View style={StyleSheet.flatten([styles.badge, { backgroundColor: colors.background, borderColor: colors.border }])} accessible accessibilityRole="text" accessibilityLabel={label} testID={testID}>
      <View style={styles.icon}>{marker.state === 'rejected' ? <TriangleAlert size={14} color={colors.text} /> : <CloudOff size={14} color={colors.text} />}</View>
      <Text style={StyleSheet.flatten([styles.text, { color: colors.text }])}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 8, paddingVertical: 2 },
  icon: { marginRight: 4 },
  text: { fontSize: 12, fontWeight: '700' },
});
