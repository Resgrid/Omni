import { useCertificationsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { Certification } from '@resgrid/models';
import { Button, ButtonText, Fab, FabIcon, FlatList, HStack, Loading, RefreshControl, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Award, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { CertificationCard } from '../components/certification-card';
import { certificationErrorKey, sortCertifications, summarize } from '../lib/certification-format';
import { certificationsRoutes } from '../routes';

export interface CertificationsListScreenProps {
  /** Override navigation to a record (e.g. a split view). */
  onOpenCertification?: (id: number) => void;
}

/**
 * "My certifications" (Responder): what the member holds, soonest expiry first, with the continuing-education hours
 * toward each renewal. Adding one is the member's; status and verification are the department's. The list persists
 * for offline reading; changes are online only.
 */
export default function CertificationsListScreen({ onOpenCertification }: CertificationsListScreenProps) {
  const { t } = useTranslation();
  const certifications = useCertificationsStore((state) => state.certifications);
  const isLoading = useCertificationsStore((state) => state.loading.mine === true);
  const error = useCertificationsStore((state) => state.errors.mine ?? null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const items = useMemo(() => sortCertifications(certifications), [certifications]);
  const summary = useMemo(() => summarize(items), [items]);

  const load = useCallback(async (bypassCache: boolean) => {
    const store = useCertificationsStore.getState();
    await Promise.allSettled([store.fetchCertifications(undefined, { bypassCache }), store.fetchTypes({ appliesTo: 0, bypassCache })]);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await load(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [load]);

  const open = useCallback((id: number) => (onOpenCertification ? onOpenCertification(id) : router.push(certificationsRoutes.detail(id))), [onOpenCertification]);
  const add = useCallback(() => router.push(certificationsRoutes.edit()), []);

  const renderItem = useCallback(({ item }: { item: Certification }) => <CertificationCard certification={item} onPress={open} />, [open]);

  const header =
    items.length > 0 ? (
      <HStack space="sm" className="mb-3" testID="certifications-summary">
        <SummaryTile value={summary.total} label={t('certifications.summary.total')} tone="neutral" testID="certifications-summary-total" />
        <SummaryTile value={summary.soon} label={t('certifications.summary.soon')} tone={summary.soon > 0 ? 'warning' : 'neutral'} testID="certifications-summary-soon" />
        <SummaryTile value={summary.expired} label={t('certifications.summary.expired')} tone={summary.expired > 0 ? 'error' : 'neutral'} testID="certifications-summary-expired" />
      </HStack>
    ) : null;

  return (
    <View className="flex-1 bg-background-50" testID="certifications-screen">
      {isLoading && !isRefreshing && items.length === 0 ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <ZeroState isError heading={t('certifications.loadFailed')} description={t(certificationErrorKey(error))} testID="certifications-error">
          <Button className="mt-4" onPress={() => void handleRefresh()} testID="certifications-retry">
            <ButtonText>{t('common.retry')}</ButtonText>
          </Button>
        </ZeroState>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.Id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <ZeroState icon={Award} heading={t('certifications.none')} description={t('certifications.noneHint')} testID="certifications-empty">
              <Button className="mt-4" onPress={add} testID="certifications-empty-add">
                <ButtonText>{t('certifications.add')}</ButtonText>
              </Button>
            </ZeroState>
          }
          contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
          testID="certifications-list"
        />
      )}
      {items.length > 0 ? (
        <Fab size="lg" placement="bottom right" onPress={add} accessibilityLabel={t('certifications.add')} testID="certifications-add">
          <FabIcon as={Plus} />
        </Fab>
      ) : null}
    </View>
  );
}

const TILE_BOX = {
  neutral: 'flex-1 rounded-xl border border-outline-200 bg-background-0 px-3 py-2',
  warning: 'flex-1 rounded-xl border border-warning-300 bg-background-warning px-3 py-2',
  error: 'flex-1 rounded-xl border border-error-300 bg-background-error px-3 py-2',
} as const;

const TILE_VALUE = { neutral: 'text-typography-900', warning: 'text-warning-700', error: 'text-error-700' } as const;

const SummaryTile: React.FC<{ value: number; label: string; tone: keyof typeof TILE_BOX; testID: string }> = ({ value, label, tone, testID }) => (
  <VStack className={TILE_BOX[tone]} accessible accessibilityLabel={`${label}: ${value}`} testID={testID}>
    <Text className={`text-xl font-bold ${TILE_VALUE[tone]}`}>{String(value)}</Text>
    <Text size="xs" className="text-typography-600" numberOfLines={1}>
      {label}
    </Text>
  </VStack>
);

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 96 },
  emptyList: { flexGrow: 1, padding: 16 },
});
