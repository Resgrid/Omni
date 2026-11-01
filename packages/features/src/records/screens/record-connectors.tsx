import { useSecurity } from '@resgrid/auth';
import { useRecordDeploymentsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { RefreshControl, ScreenHeader, Text, ZeroState } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { RadioTower } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ConnectorListItem, ReconciliationListItem } from '../components/deployment-items';
import { ContentFrame, EmptyRow, Notice, RecordsSection } from '../components/records-layout';
import { useDepartmentReconciliation } from '../hooks/use-department-reconciliation';
import { countBy, reconciliationKey } from '../lib/deployment-format';
import { recordConnector, recordDeployment } from '../routes';

export interface RecordConnectorsScreenProps {
  showHeader?: boolean;
}

/**
 * External ordering-system connectors (RMS plan §4.1), department administrators only: each connector's state and the
 * open reconciliation across them. A connector is created, changed and given its credential on the web; here an
 * administrator watches it and can read the feed now. Connector rows are never persisted (they carry feed roots).
 */
export default function RecordConnectorsScreen({ showHeader = true }: RecordConnectorsScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isUserDepartmentAdmin: isAdmin } = useSecurity();
  const connectors = useRecordDeploymentsStore((state) => state.connectors);
  const error = useRecordDeploymentsStore((state) => state.errors.connectors ?? null);
  // Loads the connectors too (through the store) before reading each one's reconciliation.
  const reconciliation = useDepartmentReconciliation(isAdmin);
  const counts = useMemo(() => countBy(reconciliation.items, 'ConnectorId'), [reconciliation.items]);

  // The server refuses a non-administrator anyway; this spares them the refusal.
  if (!isAdmin) return <ZeroState icon={RadioTower} heading={t('records.forbidden')} testID="connectors-forbidden" />;

  return (
    <View style={styles.screen} className="bg-background-0" testID="record-connectors-screen">
      {showHeader ? <ScreenHeader title={t('records.connectors')} onBack={() => router.back()} /> : null}
      <ScrollView refreshControl={<RefreshControl refreshing={reconciliation.isLoading} onRefresh={() => void reconciliation.reload()} />} contentContainerStyle={styles.content}>
        <ContentFrame>
          <Text size="xs" className="px-4 pt-3 text-typography-500">
            {t('records.connectors_hint')}
          </Text>
          <Text size="xs" className="px-4 pb-2 pt-1 text-typography-500">
            {t('records.manage_on_web')}
          </Text>
          {error ? (
            <Notice tone="error" testID="connectors-error">
              <Text size="sm" className="text-typography-800">
                {error.code === 'forbidden' ? t('records.forbidden') : t(error.messageKey)}
              </Text>
            </Notice>
          ) : null}
          <RecordsSection title={t('records.connectors')}>
            {connectors.length === 0 && !reconciliation.isLoading ? (
              <EmptyRow text={t('records.no_connectors')} testID="connectors-empty" />
            ) : (
              connectors.map((connector) => (
                <ConnectorListItem key={connector.Id} connector={connector} conflicts={counts[connector.Id]} onPress={() => router.push(recordConnector(connector.Id))} testID={`connector-${connector.Id}`} />
              ))
            )}
          </RecordsSection>
          <RecordsSection title={t('records.reconciliation')}>
            <Text size="xs" className="px-4 pb-1 text-typography-500">
              {t('records.reconciliation_hint')}
            </Text>
            {reconciliation.items.length === 0 ? (
              <EmptyRow text={t('records.no_reconciliation')} />
            ) : (
              reconciliation.items.map((item, index) => (
                <ReconciliationListItem key={reconciliationKey(item, index)} item={item} showOrder onPress={() => router.push(recordDeployment(item.OrderId))} testID={`reconciliation-${index}`} />
              ))
            )}
          </RecordsSection>
        </ContentFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: 64 },
});
