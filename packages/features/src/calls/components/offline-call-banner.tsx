import { useTranslation } from '@resgrid/i18n';
import { Text } from '@resgrid/ui';
import { WifiOff } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { QUEUED_CALL_COLORS } from './queued-call-badge';

export interface OfflineCallBannerProps {
  /** `form`: on the new-call form ("this call will be queued"); `list`: on the call list (queued calls are not dispatched). */
  context: 'form' | 'list';
  queuedCount?: number;
  testID?: string;
}

/** Plan §8.5: while offline, a banner says new calls are saved on the device and nobody is paged until they reach the server. */
export const OfflineCallBanner: React.FC<OfflineCallBannerProps> = ({ context, queuedCount = 0, testID = 'offline-call-banner' }) => {
  const { t } = useTranslation();
  const colors = QUEUED_CALL_COLORS.queued;
  const message = context === 'form' ? t('calls.offline.form_banner') : queuedCount > 0 ? t('calls.offline.list_banner_queued', { count: queuedCount }) : t('calls.offline.list_banner');
  return (
    <View style={StyleSheet.flatten([styles.banner, { backgroundColor: colors.background, borderColor: colors.border }])} accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID}>
      <View style={styles.icon}>
        <WifiOff size={18} color={colors.text} />
      </View>
      <Text style={StyleSheet.flatten([styles.text, { color: colors.text }])}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 12, marginVertical: 6 },
  icon: { marginRight: 8 },
  text: { flex: 1, fontSize: 13, fontWeight: '600' },
});
