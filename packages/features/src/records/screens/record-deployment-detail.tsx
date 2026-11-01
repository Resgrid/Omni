import { useSecurity } from '@resgrid/auth';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useRecordDeploymentsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Badge, BadgeText, Button, ButtonText, Divider, Heading, Loading, RefreshControl, ScreenHeader, Text, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Globe } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DeploymentFillItem, ReconciliationListItem } from '../components/deployment-items';
import { ContentFrame, DetailRow, EmptyRow, Notice, RecordsSection } from '../components/records-layout';
import { useDepartmentReconciliation } from '../hooks/use-department-reconciliation';
import { deploymentStatusAction, formatWhen, isConnectorOwned, reconciliationFor, reconciliationKey, statusKey } from '../lib/deployment-format';
import { recordDetail } from '../routes';

export interface RecordDeploymentDetailScreenProps {
  /** Defaults to the `id` route param. */
  orderId?: string;
  showHeader?: boolean;
}

const firstParam = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);
const isHttpsUrl = (value: string | null | undefined): value is string => !!value && /^https:\/\//i.test(value);

/**
 * One deployment: the order as the source last described it, the fills the department owes and — for an
 * administrator — where the source and the department's record disagree. Fills are moved by a coordinator on the
 * web; nothing on this screen changes one.
 */
export default function RecordDeploymentDetailScreen({ orderId: idProp, showHeader = true }: RecordDeploymentDetailScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = firstParam(params.id);
  const id = idProp ?? (routeId && isSafeRouteId(routeId) ? routeId : null);
  const { isUserDepartmentAdmin: isAdmin } = useSecurity();
  const deployment = useRecordDeploymentsStore((state) => (id ? (state.deployments.find((existing) => existing.OrderId === id) ?? null) : null));
  const isLoading = useRecordDeploymentsStore((state) => state.loading.deployment === true);
  const error = useRecordDeploymentsStore((state) => state.errors.deployment ?? null);
  const fetchDeployment = useRecordDeploymentsStore((state) => state.fetchDeployment);
  const connectorOwned = isConnectorOwned(deployment);
  const reconciliation = useDepartmentReconciliation(isAdmin && connectorOwned);

  const refresh = useCallback(() => {
    if (!id) return;
    void fetchDeployment(id);
    void reconciliation.reload();
  }, [id, fetchDeployment, reconciliation]);

  useEffect(() => {
    if (id) void fetchDeployment(id);
  }, [id, fetchDeployment]);

  const items = useMemo(() => reconciliationFor(reconciliation.items, id), [reconciliation.items, id]);

  if (!id) return <ZeroState icon={Globe} isError heading={t('records.no_deployments')} testID="deployment-invalid" />;

  return (
    <View style={styles.screen} className="bg-background-0" testID="record-deployment-screen">
      {showHeader ? <ScreenHeader title={deployment?.OrderNumber ?? t('records.deployments')} onBack={() => router.back()} /> : null}
      <ScrollView refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />} contentContainerStyle={styles.content}>
        <ContentFrame>
          {error && !deployment ? (
            <Notice tone="error" testID="deployment-error">
              <Text size="sm" className="text-typography-800">
                {error.code === 'forbidden' ? t('records.forbidden') : t(error.messageKey)}
              </Text>
            </Notice>
          ) : null}

          {deployment ? (
            <View>
              <View className="px-4 pt-3">
                <View style={styles.titleRow}>
                  <Heading size="md" className="flex-1" numberOfLines={1}>
                    {deployment.OrderNumber}
                  </Heading>
                  <Badge action={deploymentStatusAction(deployment.Status)} size="sm">
                    <BadgeText>{t(`records.deployment_status_${statusKey(deployment.Status)}`, { defaultValue: deployment.Status })}</BadgeText>
                  </Badge>
                </View>
                <Text size="sm" className="text-typography-700">
                  {[deployment.IncidentName, deployment.IncidentNumber].filter(Boolean).join(' · ')}
                </Text>
                <View style={styles.badges}>
                  {connectorOwned ? (
                    <Badge action="info" size="sm" className="mr-2" testID="deployment-connector-owned">
                      <BadgeText>{t('records.connector_maintained')}</BadgeText>
                    </Badge>
                  ) : null}
                  {deployment.IsPreview ? (
                    <Badge action="warning" size="sm">
                      <BadgeText>{t('records.preview')}</BadgeText>
                    </Badge>
                  ) : null}
                </View>
                {deployment.ProvenanceStatement ? (
                  <Text size="xs" className="mt-1 text-typography-500">
                    {deployment.ProvenanceStatement}
                  </Text>
                ) : null}
              </View>

              <View className="pt-2">
                <DetailRow label={t('records.source')} value={[deployment.SourceScheme, deployment.SourceSystem, deployment.SourceVersion ? `v${deployment.SourceVersion}` : null].filter(Boolean).join(' · ')} />
                <DetailRow label={t('records.captured_on')} value={formatWhen(deployment.SourceCapturedOn) || null} />
                <DetailRow label={t('records.offices')} value={[deployment.OrderingOffice, deployment.DispatchOffice].filter(Boolean).join(' / ')} />
                <DetailRow label={t('records.agencies')} value={[deployment.RequestingAgency, deployment.ReceivingAgency, deployment.SendingAgency].filter(Boolean).join(' · ')} />
                <DetailRow label={t('records.cost_code')} value={deployment.CostCode} />
                <DetailRow label={t('records.agreement')} value={deployment.AgreementReference} />
                <DetailRow label={t('records.closed_out_on')} value={formatWhen(deployment.ClosedOutOn) || null} />
                <DetailRow label={t('records.closeout_notes')} value={deployment.CloseoutNotes} />
              </View>

              <View style={styles.actions}>
                {deployment.RecordId && isSafeRouteId(deployment.RecordId) ? (
                  <Button variant="outline" size="sm" className="mr-2" onPress={() => router.push(recordDetail(deployment.RecordId as string))} testID="deployment-open-record">
                    <ButtonText>{t('records.open_record')}</ButtonText>
                  </Button>
                ) : null}
                {isHttpsUrl(deployment.ArtifactSafeUrl) ? (
                  <Button variant="outline" size="sm" onPress={() => void WebBrowser.openBrowserAsync(deployment.ArtifactSafeUrl as string)} testID="deployment-open-artifact">
                    <ButtonText>{t('records.open_artifact')}</ButtonText>
                  </Button>
                ) : null}
              </View>
              <Divider />

              <RecordsSection title={t('records.fills')} testID="deployment-fills">
                {deployment.Fills.length === 0 ? <EmptyRow text={t('records.no_fills')} /> : deployment.Fills.map((fill) => <DeploymentFillItem key={fill.FillId} fill={fill} testID={`deployment-fill-${fill.FillId}`} />)}
              </RecordsSection>

              {isAdmin && connectorOwned ? (
                <RecordsSection title={t('records.reconciliation')} testID="deployment-reconciliation">
                  {items.length === 0 ? (
                    <EmptyRow text={t('records.no_reconciliation')} />
                  ) : (
                    <>
                      <Text size="xs" className="px-4 pb-1 text-typography-500">
                        {t('records.reconciliation_hint')}
                      </Text>
                      {items.map((item, index) => (
                        <ReconciliationListItem key={reconciliationKey(item, index)} item={item} testID={`deployment-reconciliation-${index}`} />
                      ))}
                    </>
                  )}
                </RecordsSection>
              ) : null}
            </View>
          ) : !error ? (
            isLoading ? (
              <Loading text={t('records.loading')} />
            ) : (
              <EmptyRow text={t('records.loading')} />
            )
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
  badges: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 12 },
});
