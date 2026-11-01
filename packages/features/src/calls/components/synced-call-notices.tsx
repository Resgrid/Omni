import { type SyncedCallNotice, useCallsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Text } from '@resgrid/ui';
import { CircleCheck, TriangleAlert } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

export interface SyncedCallNoticesProps {
  onOpenCall?: (callId: string) => void;
  testID?: string;
}

/**
 * Plan §8.5: once a queued call reaches the server the creator is told (with its call number), and a possible duplicate
 * — another call at the same location within a short window, from call location history — is flagged.
 */
export const SyncedCallNotices: React.FC<SyncedCallNoticesProps> = ({ onOpenCall, testID = 'synced-call-notices' }) => {
  const syncedCalls = useCallsStore((state) => state.syncedCalls);
  const acknowledge = useCallsStore((state) => state.acknowledgeSyncedCall);
  const notices = useMemo(() => Object.values(syncedCalls).filter((notice) => !notice.acknowledged), [syncedCalls]);
  if (notices.length === 0) return null;
  return (
    <View testID={testID}>
      {notices.map((notice) => (
        <SyncedCallNoticeRow key={notice.localId} notice={notice} onDismiss={() => acknowledge(notice.localId)} onOpenCall={onOpenCall} />
      ))}
    </View>
  );
};

interface RowProps {
  notice: SyncedCallNotice;
  onDismiss: () => void;
  onOpenCall?: (callId: string) => void;
}

export const SyncedCallNoticeRow: React.FC<RowProps> = ({ notice, onDismiss, onOpenCall }) => {
  const { t } = useTranslation();
  const duplicate = notice.possibleDuplicate;
  return (
    <View
      style={StyleSheet.flatten([styles.row, duplicate ? styles.duplicate : styles.synced])}
      accessibilityRole={duplicate ? 'alert' : 'summary'}
      testID={duplicate ? `possible-duplicate-${notice.localId}` : `synced-call-${notice.localId}`}
    >
      <View style={styles.header}>
        <View style={styles.icon}>{duplicate ? <TriangleAlert size={18} color="#92400E" /> : <CircleCheck size={18} color="#166534" />}</View>
        <Text style={styles.title}>{notice.number ? t('calls.queued.synced_with_number', { number: notice.number }) : t('calls.queued.synced')}</Text>
      </View>
      {duplicate ? <Text style={styles.body}>{t('calls.queued.possible_duplicate', { count: notice.duplicateCallIds.length })}</Text> : null}
      <View style={styles.actions}>
        {duplicate && onOpenCall && notice.duplicateCallIds[0] ? (
          <Button size="xs" variant="outline" className="mr-2" onPress={() => onOpenCall(notice.duplicateCallIds[0])} accessibilityLabel={t('calls.queued.view_duplicate')}>
            <ButtonText>{t('calls.queued.view_duplicate')}</ButtonText>
          </Button>
        ) : null}
        {onOpenCall && notice.callId ? (
          <Button size="xs" variant="outline" className="mr-2" onPress={() => onOpenCall(notice.callId)} accessibilityLabel={t('calls.view_details')}>
            <ButtonText>{t('calls.view_details')}</ButtonText>
          </Button>
        ) : null}
        <Button size="xs" variant="link" onPress={onDismiss} accessibilityLabel={t('common.dismiss')} testID={`dismiss-synced-${notice.localId}`}>
          <ButtonText>{t('common.dismiss')}</ButtonText>
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { borderRadius: 8, borderWidth: 1, padding: 10, marginHorizontal: 12, marginVertical: 4 },
  synced: { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
  duplicate: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  header: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1F2937' },
  body: { fontSize: 13, color: '#78350F', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
});
