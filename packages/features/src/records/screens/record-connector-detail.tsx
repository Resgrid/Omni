import { useSecurity } from '@resgrid/auth';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useRecordDeploymentsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { RecordDeploymentConnectorRunData } from '@resgrid/models';
import { Badge, BadgeText, Button, ButtonText, Heading, RefreshControl, ScreenHeader, Text, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RadioTower } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ConnectorRunItem, ReconciliationListItem } from '../components/deployment-items';
import { ContentFrame, DetailRow, EmptyRow, Notice, RecordsSection } from '../components/records-layout';
import { connectorStateAction, connectorStateKey, formatWhen, reconciliationKey } from '../lib/deployment-format';
import { recordDeployment, recordDeployments } from '../routes';

export interface RecordConnectorDetailScreenProps {
  /** Defaults to the `id` route param. */
  connectorId?: string;
  showHeader?: boolean;
}

const firstParam = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);
const EMPTY_RUNS: RecordDeploymentConnectorRunData[] = [];

/**
 * One connector (RMS plan §4.1), department administrators only: its state, the one command a field client may issue
 * — read the feed now — its run log and its open reconciliation. Enabling, terms, credentials and the inbound token
 * are web-only; write authority does not exist at all.
 */
export default function RecordConnectorDetailScreen({ connectorId: idProp, showHeader = true }: RecordConnectorDetailScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = firstParam(params.id);
  const id = idProp ?? (routeId && isSafeRouteId(routeId) ? routeId : null);
  const { isUserDepartmentAdmin: isAdmin } = useSecurity();

  const connector = useRecordDeploymentsStore((state) => (id ? (state.connectors.find((existing) => existing.Id === id) ?? null) : null));
  const runs = useRecordDeploymentsStore((state) => (id ? (state.runs[id] ?? EMPTY_RUNS) : EMPTY_RUNS));
  const reconciliation = useRecordDeploymentsStore((state) => state.reconciliation);
  const runningConnectorId = useRecordDeploymentsStore((state) => state.runningConnectorId);
  const runError = useRecordDeploymentsStore((state) => state.runError);
  const loadError = useRecordDeploymentsStore((state) => state.errors.connector ?? null);
  const fetchConnector = useRecordDeploymentsStore((state) => state.fetchConnector);
  const fetchRuns = useRecordDeploymentsStore((state) => state.fetchRuns);
  const fetchReconciliation = useRecordDeploymentsStore((state) => state.fetchReconciliation);
  const runConnector = useRecordDeploymentsStore((state) => state.runConnector);
  const [refreshing, setRefreshing] = useState(false);
  const [finished, setFinished] = useState<RecordDeploymentConnectorRunData | null>(null);

  const load = useCallback(async () => {
    if (!id || !isAdmin) return;
    setRefreshing(true);
    try {
      await Promise.all([fetchConnector(id), fetchRuns(id), fetchReconciliation(id)]);
    } finally {
      setRefreshing(false);
    }
  }, [id, isAdmin, fetchConnector, fetchRuns, fetchReconciliation]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => reconciliation.filter((item) => !item.ConnectorId || item.ConnectorId === id), [reconciliation, id]);
  const isRunning = runningConnectorId === id;

  const readNow = async () => {
    if (!id) return;
    setFinished(null);
    if (await runConnector(id)) {
      // The run log is re-read by the store; its newest row is the run just made.
      setFinished(useRecordDeploymentsStore.getState().runs[id]?.[0] ?? null);
      await Promise.all([fetchConnector(id), fetchReconciliation(id)]);
    }
  };

  if (!isAdmin) return <ZeroState icon={RadioTower} heading={t('records.forbidden')} testID="connector-forbidden" />;
  if (!id) return <ZeroState icon={RadioTower} isError heading={t('records.no_connectors')} testID="connector-invalid" />;

  return (
    <View style={styles.screen} className="bg-background-0" testID="record-connector-screen">
      {showHeader ? <ScreenHeader title={connector?.Name ?? t('records.connectors')} onBack={() => router.back()} /> : null}
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />} contentContainerStyle={styles.content}>
        <ContentFrame>
          {loadError ? (
            <Notice tone="error" testID="connector-error">
              <Text size="sm" className="text-typography-800">
                {loadError.code === 'forbidden' ? t('records.forbidden') : t(loadError.messageKey)}
              </Text>
            </Notice>
          ) : null}
          {runError ? (
            <Notice tone="error" testID="connector-run-error">
              <Text size="sm" className="text-typography-800">
                {t('records.run_failed')}
              </Text>
            </Notice>
          ) : null}
          {finished ? (
            <Notice tone="info" testID="connector-message">
              <Text size="sm" className="text-typography-800">
                {t(finished.Outcome === 'ok' ? 'records.run_finished' : 'records.run_not_ok', {
                  outcome: t(`records.run_outcome_${finished.Outcome}`, { defaultValue: finished.Outcome }),
                  created: finished.OrdersCreated,
                  snapshots: finished.SnapshotsRecorded,
                  requests: finished.RequestsAdded,
                  conflicts: finished.Conflicts,
                })}
              </Text>
            </Notice>
          ) : null}

          {connector ? (
            <View>
              <View className="px-4 pt-3">
                <View style={styles.titleRow}>
                  <Heading size="md" className="flex-1" numberOfLines={1}>
                    {connector.Name}
                  </Heading>
                  <Badge action={connectorStateAction(connector)} size="sm">
                    <BadgeText testID="connector-state">{t(connectorStateKey(connector))}</BadgeText>
                  </Badge>
                </View>
                <Text size="xs" className="text-typography-500">
                  {[connector.ProviderKey, connector.SourceScheme, connector.ProfileKey].join(' · ')}
                </Text>
                <Text size="xs" className="text-typography-400" numberOfLines={2}>
                  {connector.BaseUrl}
                </Text>
              </View>
              <View className="pt-2">
                <DetailRow label={t('records.terms')} value={connector.TermsAcknowledgedOn ? `${t('records.terms_acknowledged')} · ${formatWhen(connector.TermsAcknowledgedOn)}` : t('records.terms_not_acknowledged')} />
                <DetailRow label={t('records.read_authority')} value={connector.ReadEnabled ? t('records.granted') : t('records.not_granted')} />
                <DetailRow label={t('records.write_authority')} value={t('records.write_refused')} />
                <DetailRow label={t('records.last_read')} value={formatWhen(connector.LastPolledOn) || t('records.never_read')} />
                <DetailRow label={t('records.last_success')} value={formatWhen(connector.LastSuccessOn) || null} />
                <DetailRow label={t('records.last_error')} value={connector.LastError} testID="connector-last-error" />
                <DetailRow label={t('records.requests_this_hour')} value={`${connector.RequestsThisHour} / ${connector.MaxRequestsPerHour}`} />
                <DetailRow label={t('records.poll_interval')} value={t('records.minutes', { count: connector.PollIntervalMinutes })} />
              </View>
              <View style={styles.actions}>
                <Button size="sm" className="mr-2" isDisabled={!connector.IsReadyToRun || isRunning} onPress={() => void readNow()} testID="connector-read-now">
                  <ButtonText>{isRunning ? t('records.reading_feed') : t('records.read_feed_now')}</ButtonText>
                </Button>
                <Button variant="outline" size="sm" onPress={() => router.push(recordDeployments())} testID="connector-open-deployments">
                  <ButtonText>{t('records.deployments')}</ButtonText>
                </Button>
              </View>
              <Text size="xs" className="px-4 pb-2 text-typography-500">
                {t('records.manage_on_web')}
              </Text>

              <RecordsSection title={t('records.reconciliation')}>
                {items.length === 0 ? (
                  <EmptyRow text={t('records.no_reconciliation')} />
                ) : (
                  items.map((item, index) => (
                    <ReconciliationListItem key={reconciliationKey(item, index)} item={item} showOrder onPress={() => router.push(recordDeployment(item.OrderId))} testID={`connector-reconciliation-${index}`} />
                  ))
                )}
              </RecordsSection>
              <RecordsSection title={t('records.run_log')}>
                {runs.length === 0 ? <EmptyRow text={t('records.no_runs')} /> : runs.map((run) => <ConnectorRunItem key={run.Id} run={run} testID={`connector-run-${run.Id}`} />)}
              </RecordsSection>
            </View>
          ) : !loadError ? (
            <EmptyRow text={t('records.loading')} />
          ) : null}
        </ContentFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: 64 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 12 },
});
