import { FeatureFlagKeys, useFeatureFlagStatus } from '@resgrid/auth';
import { useOperationsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { Deployment } from '@resgrid/models';
import { Loading, Pressable, RefreshControl, Text, useFormFactor, ZeroState } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { BriefcaseBusiness } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { OperationsFrame, Segments } from '../components/operations-layout';
import { dateOf, operationsErrorKey } from '../lib/time';
import { operationsDeployment } from '../routes';

type Filter = 'open' | 'all';

const DeploymentCard: React.FC<{ deployment: Deployment; onPress: () => void }> = ({ deployment, onPress }) => {
  const { t } = useTranslation();
  const numbers = [deployment.IncidentNumber, deployment.RequestNumber, deployment.ResourceOrderNumber].filter(Boolean).join(' · ');
  const status = t(`operations.status.${deployment.Status}`);
  const start = dateOf(deployment.StartOn);
  const end = dateOf(deployment.EndOn);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${deployment.Name}, ${status}`}
      testID={`operations-deployment-${deployment.Id}`}
      className="rounded-lg border border-outline-200 bg-background-0 p-3"
    >
      <View style={styles.cardTitle}>
        <Text className="flex-1 font-semibold text-typography-900">{deployment.Name}</Text>
        <Text className="text-typography-500">{status}</Text>
      </View>
      <Text className="text-typography-500">{numbers || t('operations.noNumbers')}</Text>
      {start ? <Text className="text-typography-500">{end ? `${start} – ${end}` : start}</Text> : null}
    </Pressable>
  );
};

/**
 * Deployments the person may see (Workforce & Business Operations, Phase C; identical in R/U/I/D): a rostered member's
 * own, a manager's whole department. Gated by `Operations.Deployments` (unknown waits, so a deep link never flashes
 * the list) and the server's access answer. Persisted, so the last list reads offline. Cards tile on wide screens.
 */
export default function OperationsListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPhone } = useFormFactor();
  const flagStatus = useFeatureFlagStatus(FeatureFlagKeys.Deployments);
  const access = useOperationsStore((state) => state.access);
  const deployments = useOperationsStore((state) => state.deployments);
  const isLoading = useOperationsStore((state) => state.loading.deployments === true || state.loading.access === true);
  const error = useOperationsStore((state) => state.errors.deployments ?? state.errors.access ?? null);
  const [filter, setFilter] = useState<Filter>('open');

  const load = useCallback(async (next: Filter) => {
    const store = useOperationsStore.getState();
    await store.loadAccess();
    if (useOperationsStore.getState().access?.Enabled) await useOperationsStore.getState().loadDeployments(next === 'all');
  }, []);

  useEffect(() => {
    if (flagStatus === 'enabled') void load(filter);
  }, [flagStatus, filter, load]);

  if (flagStatus === 'disabled') return <ZeroState icon={BriefcaseBusiness} heading={t('operations.disabled')} testID="operations-disabled" />;
  if (flagStatus === 'unknown') return <Loading />;

  const errorKey = operationsErrorKey(error);

  return (
    <View style={styles.screen} className="bg-background-50" testID="operations-list-screen">
      <ScrollView refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void load(filter)} />} contentContainerStyle={styles.content}>
        <OperationsFrame maxWidth={1280}>
          <Text className="mb-2 text-xl font-bold text-typography-900" accessibilityRole="header">
            {t('operations.title')}
          </Text>
          {errorKey ? (
            <Text accessibilityRole="alert" className="mb-2 text-error-600" testID="operations-error">
              {t(`operations.errors.${errorKey}`)}
            </Text>
          ) : null}
          {access && !access.Enabled ? (
            <Text className="text-typography-500" testID="operations-access-disabled">
              {t('operations.disabled')}
            </Text>
          ) : null}
          {access?.Enabled ? (
            <Segments
              options={[
                { value: 'open', label: t('operations.open'), testID: 'operations-filter-open' },
                { value: 'all', label: t('operations.all'), testID: 'operations-filter-all' },
              ]}
              value={filter}
              onChange={setFilter}
            />
          ) : null}
          {access?.Enabled && !isLoading && deployments.length === 0 ? (
            <Text className="mt-2 text-typography-500" testID="operations-empty">
              {t('operations.none')}
            </Text>
          ) : null}
          <View style={styles.grid}>
            {deployments.map((deployment) => (
              <View key={deployment.Id} style={isPhone ? styles.cellFull : styles.cellHalf}>
                <DeploymentCard deployment={deployment} onPress={() => router.push(operationsDeployment(deployment.Id))} />
              </View>
            ))}
          </View>
        </OperationsFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  cardTitle: { flexDirection: 'row', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, marginHorizontal: -6 },
  cellFull: { width: '100%', padding: 6 },
  cellHalf: { width: '50%', padding: 6 },
});
