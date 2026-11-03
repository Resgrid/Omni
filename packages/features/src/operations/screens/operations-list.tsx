import { FeatureFlagKeys, useFeatureFlagStatus } from '@resgrid/auth';
import { useOperationsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { Deployment } from '@resgrid/models';
import { Button, ButtonText, Loading, RefreshControl, Text, useFormFactor, ZeroState } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { BriefcaseBusiness } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DeploymentCard } from '../components/deployment-card';
import { OperationsFrame, Segments } from '../components/operations-layout';
import { operationsErrorKey } from '../lib/time';
import { operationsDeployment } from '../routes';

type Filter = 'open' | 'all';

/**
 * Deployments the person may see (Workforce & Business Operations, Phase C; identical in R/U/I/D): a rostered member's
 * own, a manager's whole department. Gated by `Operations.Deployments` (unknown waits, so a deep link never flashes
 * the list) and the server's access answer. Persisted, so the last list reads offline. Open / All stays above the
 * list; an empty list explains what lands here (and points at All when only open ones were asked for), a failed first
 * load offers a retry, and cards tile on wide screens.
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
  // The filter the list on screen was last loaded for: until it matches, an empty list is still loading, not empty.
  const [loadedFilter, setLoadedFilter] = useState<Filter | null>(null);

  const load = useCallback(async (next: Filter) => {
    const store = useOperationsStore.getState();
    await store.loadAccess();
    if (useOperationsStore.getState().access?.Enabled) await useOperationsStore.getState().loadDeployments(next === 'all');
    setLoadedFilter(next);
  }, []);

  useEffect(() => {
    if (flagStatus === 'enabled') void load(filter);
  }, [flagStatus, filter, load]);

  const openDeployment = useCallback((deployment: Deployment) => router.push(operationsDeployment(deployment.Id)), [router]);

  if (flagStatus === 'disabled') return <ZeroState icon={BriefcaseBusiness} heading={t('operations.disabled')} testID="operations-disabled" />;
  if (flagStatus === 'unknown') return <Loading />;
  if (access && !access.Enabled) return <ZeroState icon={BriefcaseBusiness} heading={t('operations.disabled')} testID="operations-access-disabled" />;

  const errorKey = operationsErrorKey(error);
  const isEmpty = deployments.length === 0;
  const isFirstLoad = isEmpty && !errorKey && loadedFilter !== filter;
  const isRefreshing = isLoading && !isFirstLoad;
  const refresh = () => void load(filter);

  const body =
    isEmpty && errorKey ? (
      <ZeroState isError heading={t('operations.loadFailed')} description={t(`operations.errors.${errorKey}`)} testID="operations-error">
        <Button onPress={refresh} className="mt-2" testID="operations-retry">
          <ButtonText>{t('common.retry')}</ButtonText>
        </Button>
      </ZeroState>
    ) : isFirstLoad ? (
      <Loading />
    ) : isEmpty ? (
      <ZeroState
        icon={BriefcaseBusiness}
        heading={filter === 'open' ? t('operations.empty.openTitle') : t('operations.empty.allTitle')}
        description={filter === 'open' ? t('operations.empty.openDescription') : access?.CanManage ? t('operations.empty.allDescriptionManager') : t('operations.empty.allDescription')}
        testID="operations-empty"
      >
        {filter === 'open' ? (
          <Button onPress={() => setFilter('all')} className="mt-2" testID="operations-empty-show-all">
            <ButtonText>{t('operations.empty.showAll')}</ButtonText>
          </Button>
        ) : (
          <Button variant="outline" onPress={refresh} className="mt-2" testID="operations-empty-refresh">
            <ButtonText>{t('common.refresh')}</ButtonText>
          </Button>
        )}
      </ZeroState>
    ) : (
      <OperationsFrame maxWidth={1280}>
        {errorKey ? (
          <Text accessibilityRole="alert" className="mb-1 text-error-600" testID="operations-error-inline">
            {t(`operations.errors.${errorKey}`)}
          </Text>
        ) : null}
        <View style={styles.grid}>
          {deployments.map((deployment) => (
            <View key={deployment.Id} style={isPhone ? styles.cellFull : styles.cellHalf}>
              <DeploymentCard deployment={deployment} onPress={openDeployment} />
            </View>
          ))}
        </View>
      </OperationsFrame>
    );

  return (
    <View style={styles.screen} className="bg-background-50" testID="operations-list-screen">
      <OperationsFrame maxWidth={1280}>
        <View style={styles.toolbar}>
          <Segments
            options={[
              { value: 'open', label: t('operations.open'), testID: 'operations-filter-open' },
              { value: 'all', label: t('operations.all'), testID: 'operations-filter-all' },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>
      </OperationsFrame>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}>
        {body}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  cellFull: { width: '100%', padding: 6 },
  cellHalf: { width: '50%', padding: 6 },
});
