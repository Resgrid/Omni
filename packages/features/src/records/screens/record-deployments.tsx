import { useSecurity } from '@resgrid/auth';
import { useRecordDeploymentsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Divider, RefreshControl, ScreenHeader, Text } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { RadioTower } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DeploymentListItem, RecordsEntryRow } from '../components/deployment-items';
import { ContentFrame, EmptyRow, Notice } from '../components/records-layout';
import { useDepartmentReconciliation } from '../hooks/use-department-reconciliation';
import { countBy, sortDeployments } from '../lib/deployment-format';
import { recordConnectors, recordDeployment } from '../routes';

export interface RecordDeploymentsScreenProps {
  showHeader?: boolean;
}

/**
 * Deployments (RMS plan §4.1): the external resource orders the department is filling, each with the fills it owes.
 * The ordering system stays authoritative, so the list is read-only here. Administrators also see how many
 * reconciliation items each order carries and can reach the connectors. Persisted, so it reads offline.
 */
export default function RecordDeploymentsScreen({ showHeader = true }: RecordDeploymentsScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isUserDepartmentAdmin: isAdmin } = useSecurity();
  const deployments = useRecordDeploymentsStore((state) => state.deployments);
  const includeClosed = useRecordDeploymentsStore((state) => state.includeClosed);
  const isLoading = useRecordDeploymentsStore((state) => state.loading.deployments === true);
  const error = useRecordDeploymentsStore((state) => state.errors.deployments ?? null);
  const fetchDeployments = useRecordDeploymentsStore((state) => state.fetchDeployments);
  const reconciliation = useDepartmentReconciliation(isAdmin);

  const refresh = useCallback(() => {
    void fetchDeployments();
    void reconciliation.reload();
  }, [fetchDeployments, reconciliation]);

  useEffect(() => {
    void fetchDeployments();
  }, [fetchDeployments]);

  const counts = useMemo(() => countBy(reconciliation.items, 'OrderId'), [reconciliation.items]);
  const sorted = useMemo(() => sortDeployments(deployments), [deployments]);

  return (
    <View style={styles.screen} className="bg-background-0" testID="record-deployments-screen">
      {showHeader ? <ScreenHeader title={t('records.deployments')} onBack={() => router.back()} /> : null}
      <ScrollView refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />} contentContainerStyle={styles.content}>
        <ContentFrame>
          <Text size="xs" className="px-4 pt-3 text-typography-500">
            {t('records.deployments_hint')}
          </Text>
          {error ? (
            <Notice tone="error" testID="deployments-error">
              <Text size="sm" className="text-typography-800">
                {error.code === 'forbidden' ? t('records.forbidden') : t(error.messageKey)}
              </Text>
            </Notice>
          ) : null}
          {isAdmin ? (
            <>
              <RecordsEntryRow
                icon={<RadioTower size={18} color="#2563eb" />}
                title={t('records.connectors')}
                subtitle={t('records.connectors_hint')}
                count={reconciliation.items.length}
                attention
                onPress={() => router.push(recordConnectors())}
                testID="deployments-connectors"
              />
              <Divider />
            </>
          ) : null}
          {sorted.length === 0 && !isLoading ? (
            <EmptyRow text={t('records.no_deployments')} testID="deployments-empty" />
          ) : (
            sorted.map((deployment) => (
              <DeploymentListItem
                key={deployment.OrderId}
                deployment={deployment}
                conflicts={counts[deployment.OrderId]}
                onPress={() => router.push(recordDeployment(deployment.OrderId))}
                testID={`deployment-${deployment.OrderId}`}
              />
            ))
          )}
          <View className="m-4">
            <Button variant="outline" size="sm" className="self-start" onPress={() => void fetchDeployments({ includeClosed: !includeClosed })} testID="deployments-toggle-closed">
              <ButtonText>{includeClosed ? t('records.hide_closed') : t('records.include_closed')}</ButtonText>
            </Button>
          </View>
        </ContentFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: 64 },
});
