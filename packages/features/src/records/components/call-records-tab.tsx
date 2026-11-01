import { FeatureFlagKeys, recordsFieldFlagKey } from '@resgrid/auth';
import { useRecordsStore } from '@resgrid/data';
import type { CallDetailTabContext, CallDetailTabDefinition } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { RecordSummaryData } from '@resgrid/models';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useRecordsFieldStatus } from '../hooks/use-records-field-status';
import { visiblePendingDrafts } from '../lib/drafts';
import { recordDetail, recordNew } from '../routes';
import { PendingDraftItem, RecordListItem } from './record-list-item';
import { EmptyRow } from './records-layout';
import { RecordsQuickCreate } from './records-quick-create';

export interface CallRecordsTabProps {
  callId: string;
}

/**
 * The call detail "Records" tab (omni-plan §7.10 call-detail tab registry): start a record in this call's context and
 * see the records already linked to it — the synced lists filtered by call, plus drafts on this device — so it also
 * reads offline. The server re-verifies the call context on every request.
 */
export const CallRecordsTab: React.FC<CallRecordsTabProps> = ({ callId }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const flagStatus = useRecordsFieldStatus();
  const numericCallId = Number.parseInt(callId, 10);
  const recent = useRecordsStore((state) => state.recent);
  const drafts = useRecordsStore((state) => state.drafts);
  const pendingDrafts = useRecordsStore((state) => state.pendingDrafts);
  const context = useMemo(() => (Number.isFinite(numericCallId) && numericCallId > 0 ? { CallId: numericCallId } : {}), [numericCallId]);

  const linked = useMemo(() => {
    const byId = new Map<string, RecordSummaryData>();
    for (const record of [...drafts, ...recent]) if (record.CallId === numericCallId && !byId.has(record.RecordId)) byId.set(record.RecordId, record);
    return [...byId.values()];
  }, [drafts, recent, numericCallId]);
  const pending = useMemo(() => visiblePendingDrafts(pendingDrafts).filter((draft) => draft.callId === numericCallId), [pendingDrafts, numericCallId]);

  if (flagStatus !== 'enabled') return null;

  return (
    <View style={styles.panel} testID="call-records-tab">
      <View style={styles.actions}>
        <RecordsQuickCreate context={context} testID="call-records-new" />
      </View>
      {pending.map((draft) => (
        <PendingDraftItem key={draft.clientRecordId} draft={draft} onPress={() => router.push(recordNew(draft.clientRecordId))} testID={`call-records-pending-${draft.clientRecordId}`} />
      ))}
      {linked.map((record) => (
        <RecordListItem key={record.RecordId} record={record} onPress={() => router.push(recordDetail(record.RecordId))} testID={`call-records-${record.RecordId}`} />
      ))}
      {linked.length === 0 && pending.length === 0 ? <EmptyRow text={t('records.no_call_records')} testID="call-records-empty" /> : null}
    </View>
  );
};

/** Visible when the department has Field Records on for this app (`Records.System` + `Records.Field.<App>`). */
export const isCallRecordsTabVisible = (context: Pick<CallDetailTabContext, 'isFeatureEnabled' | 'variantId'>): boolean => {
  const childKey = recordsFieldFlagKey(context.variantId);
  return childKey !== null && context.isFeatureEnabled(FeatureFlagKeys.RecordsSystem) && context.isFeatureEnabled(childKey);
};

/** The call detail tab definition. Order 85: after Site info (80), before Location history (90). */
export const CALL_RECORDS_TAB: CallDetailTabDefinition = {
  id: 'records',
  order: 85,
  title: 'records.title',
  render: (context) => <CallRecordsTab callId={context.callId} />,
  visible: isCallRecordsTabVisible,
};

const styles = StyleSheet.create({
  panel: { paddingVertical: 8 },
  actions: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8 },
});
