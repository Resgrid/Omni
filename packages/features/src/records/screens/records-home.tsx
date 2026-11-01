import { useSecurity, useTerm } from '@resgrid/auth';
import { selectOwnDrafts, selectReturnedRecords, useRecordDeploymentsStore, useRecordsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { FieldRecordContextInput } from '@resgrid/models';
import { Button, ButtonText, Fab, Loading, RefreshControl, Text, useFormFactor, ZeroState } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { FileText, Globe, Plus, RadioTower } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { RecordsEntryRow } from '../components/deployment-items';
import { AssignmentItem, PendingDraftItem, RecordListItem } from '../components/record-list-item';
import { ContentFrame, EmptyRow, Notice, RecordsSection } from '../components/records-layout';
import { useDepartmentReconciliation } from '../hooks/use-department-reconciliation';
import { useRecordsContext } from '../hooks/use-records-context';
import { useRecordsFieldStatus } from '../hooks/use-records-field-status';
import { openDeploymentCount } from '../lib/deployment-format';
import { settlePendingDrafts, visiblePendingDrafts } from '../lib/drafts';
import { recordConnectors, recordDeployments, recordDetail, recordNew } from '../routes';

const RECENT_LIMIT = 25;

export interface RecordsHomeScreenProps {
  /** Overrides the field context (default: `useRecordsContext()` — the shell's active call/unit or a registered hook). */
  context?: FieldRecordContextInput;
}

/**
 * Field Records home (RMS plan RMS-1D; IC baseline, identical in R/U/D): New, Assigned, Deployments, Drafts, Returned
 * and Recent. Everything shown came from the server's own filtering; this screen never decides what the person may
 * author. Landscape boards and desktop windows show the work lists beside the reference lists.
 */
export default function RecordsHomeScreen({ context: contextProp }: RecordsHomeScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPhone, isLandscapeBoard, isDesktop } = useFormFactor();
  const flagStatus = useRecordsFieldStatus();
  const defaultContext = useRecordsContext();
  const context = contextProp ?? defaultContext;
  const title = useTerm('module.records', t('records.title'));
  const { isUserDepartmentAdmin: isAdmin } = useSecurity();

  const catalog = useRecordsStore((state) => state.catalog);
  const assignments = useRecordsStore((state) => state.assignments);
  const recent = useRecordsStore((state) => state.recent);
  const drafts = useRecordsStore((state) => state.drafts);
  const pendingDrafts = useRecordsStore((state) => state.pendingDrafts);
  const isSyncing = useRecordsStore((state) => state.loading.sync === true || state.loading.catalog === true);
  const syncError = useRecordsStore((state) => state.errors.sync ?? state.errors.catalog ?? null);
  const setContext = useRecordsStore((state) => state.setContext);
  const fetchCatalog = useRecordsStore((state) => state.fetchCatalog);
  const sync = useRecordsStore((state) => state.sync);

  const deployments = useRecordDeploymentsStore((state) => state.deployments);
  const fetchDeployments = useRecordDeploymentsStore((state) => state.fetchDeployments);
  const reconciliation = useDepartmentReconciliation(isAdmin && flagStatus === 'enabled');

  const { CallId, UnitId, GroupId, CommandRole, ContactId } = context;
  const load = useCallback(async () => {
    setContext({ CallId, UnitId, GroupId, CommandRole, ContactId });
    const loaded = await fetchCatalog();
    if (loaded && !loaded.Ok) return;
    await sync();
    await settlePendingDrafts();
    // Deployments ride along: the list is small and read-only.
    void fetchDeployments();
  }, [CallId, UnitId, GroupId, CommandRole, ContactId, setContext, fetchCatalog, sync, fetchDeployments]);

  useEffect(() => {
    if (flagStatus === 'enabled') void load();
  }, [flagStatus, load]);

  const pending = useMemo(() => visiblePendingDrafts(pendingDrafts), [pendingDrafts]);
  const ownDrafts = useMemo(() => selectOwnDrafts({ drafts }), [drafts]);
  const returned = useMemo(() => selectReturnedRecords({ drafts }), [drafts]);
  const canCreate = (catalog?.Definitions.length ?? 0) > 0;
  const twoColumns = !isPhone && (isLandscapeBoard || isDesktop);

  if (flagStatus === 'disabled') return <ZeroState icon={FileText} heading={t('records.unavailable')} testID="records-home-disabled" />;
  if (flagStatus === 'unknown') return <Loading text={t('records.loading')} />;

  const workLists = (
    <>
      <RecordsSection title={t('records.assigned')} testID="records-section-assigned">
        {assignments.length === 0 ? (
          <EmptyRow text={t('records.no_assignments')} />
        ) : (
          assignments.map((assignment) => (
            <AssignmentItem key={assignment.AssignmentId} assignment={assignment} onPress={() => router.push(recordDetail(assignment.RecordId))} testID={`records-assignment-${assignment.AssignmentId}`} />
          ))
        )}
      </RecordsSection>
      <RecordsSection title={t('records.drafts')} testID="records-section-drafts">
        {pending.length === 0 && ownDrafts.length === 0 ? (
          <EmptyRow text={t('records.no_drafts')} />
        ) : (
          <>
            {pending.map((draft) => (
              <PendingDraftItem key={draft.clientRecordId} draft={draft} onPress={() => router.push(recordNew(draft.clientRecordId))} testID={`records-pending-${draft.clientRecordId}`} />
            ))}
            {ownDrafts.map((record) => (
              <RecordListItem key={record.RecordId} record={record} onPress={() => router.push(recordDetail(record.RecordId))} testID={`records-draft-${record.RecordId}`} />
            ))}
          </>
        )}
      </RecordsSection>
      <RecordsSection title={t('records.returned')} testID="records-section-returned">
        {returned.length === 0 ? (
          <EmptyRow text={t('records.no_returned')} />
        ) : (
          returned.map((record) => <RecordListItem key={record.RecordId} record={record} onPress={() => router.push(recordDetail(record.RecordId))} testID={`records-returned-${record.RecordId}`} />)
        )}
      </RecordsSection>
    </>
  );

  const referenceLists = (
    <>
      <RecordsSection title={t('records.deployments')} testID="records-section-deployments">
        <RecordsEntryRow
          icon={<Globe size={18} color="#2563eb" />}
          title={t('records.deployments')}
          subtitle={t('records.deployments_home_hint')}
          count={openDeploymentCount(deployments)}
          onPress={() => router.push(recordDeployments())}
          testID="records-deployments"
        />
        {isAdmin ? (
          <RecordsEntryRow
            icon={<RadioTower size={18} color="#2563eb" />}
            title={t('records.connectors')}
            subtitle={t('records.connectors_home_hint')}
            count={reconciliation.items.length}
            attention
            onPress={() => router.push(recordConnectors())}
            testID="records-connectors"
          />
        ) : null}
      </RecordsSection>
      <RecordsSection title={t('records.recent')} testID="records-section-recent">
        {recent.length === 0 ? (
          <EmptyRow text={t('records.no_recent')} />
        ) : (
          recent.slice(0, RECENT_LIMIT).map((record) => <RecordListItem key={record.RecordId} record={record} onPress={() => router.push(recordDetail(record.RecordId))} testID={`records-recent-${record.RecordId}`} />)
        )}
      </RecordsSection>
    </>
  );

  return (
    <View style={styles.screen} className="bg-background-0" testID="records-home-screen">
      <ScrollView refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={() => void load()} />} contentContainerStyle={styles.content}>
        <ContentFrame maxWidth={twoColumns ? 1280 : undefined}>
          <Text className="px-4 pt-3 text-xl font-bold text-typography-900" accessibilityRole="header">
            {title}
          </Text>
          {catalog && !catalog.Ok ? (
            <Notice tone="warning" testID="records-unavailable">
              <Text size="sm" className="text-typography-800">
                {t('records.unavailable')}
              </Text>
              {catalog.Reasons.map((reason) => (
                <Text key={reason} size="xs" className="mt-1 text-typography-600">
                  {t(`records.reason_${reason}`, { defaultValue: reason })}
                </Text>
              ))}
            </Notice>
          ) : null}
          {syncError ? (
            <Notice tone="error" testID="records-error">
              <Text size="sm" className="text-typography-800">
                {t(syncError.messageKey)}
              </Text>
            </Notice>
          ) : null}

          {twoColumns ? (
            <View style={styles.columns}>
              <View style={styles.column}>{workLists}</View>
              <View style={styles.column}>{referenceLists}</View>
            </View>
          ) : (
            <>
              {workLists}
              {referenceLists}
            </>
          )}

          {!canCreate && catalog?.Ok ? (
            <View className="m-4">
              <Text size="sm" className="text-typography-500">
                {t('records.nothing_to_create')}
              </Text>
              <Button variant="outline" size="sm" className="mt-2 self-start" onPress={() => void fetchCatalog()} testID="records-refresh-catalog">
                <ButtonText>{t('records.refresh_catalog')}</ButtonText>
              </Button>
            </View>
          ) : null}
        </ContentFrame>
      </ScrollView>
      {canCreate ? (
        <Fab size="lg" placement="bottom right" onPress={() => router.push(recordNew())} accessibilityLabel={t('records.new_record')} testID="records-new-fab">
          <View>
            <Plus size={24} color="#FFFFFF" />
          </View>
        </Fab>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: 96 },
  columns: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flex: 1 },
});
