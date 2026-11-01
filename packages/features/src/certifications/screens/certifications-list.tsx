import { useCertificationsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { Certification } from '@resgrid/models';
import { Button, ButtonText, FlatList, HStack, Loading, Pressable, RefreshControl, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Award, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useExpiryText } from '../hooks/use-expiry-text';
import { certificationErrorKey, certificationName, expiryTone, sortCertifications } from '../lib/certification-format';
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
  const expiryText = useExpiryText();
  const items = useMemo(() => sortCertifications(certifications), [certifications]);

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

  const renderItem = useCallback(
    ({ item }: { item: Certification }) => (
      <Pressable
        onPress={() => open(item.Id)}
        accessibilityRole="button"
        accessibilityLabel={certificationName(item, t('certifications.untitled'))}
        className="mb-3 rounded-lg border border-outline-200 bg-background-0 p-3"
        testID={`certification-${item.Id}`}
      >
        <HStack className="items-center justify-between" space="sm">
          <Text className="flex-1 font-semibold text-typography-900">{certificationName(item, t('certifications.untitled'))}</Text>
          <Text className="text-typography-500" testID={`certification-${item.Id}-status`}>
            {t(`certifications.status.${item.Status}`)}
          </Text>
        </HStack>
        {item.Number ? <Text className="text-typography-500">{t('certifications.numberIs', { number: item.Number })}</Text> : null}
        <Text className={expiryTone(item.DaysUntilExpiry, item.Status)} testID={`certification-${item.Id}-expiry`}>
          {expiryText(item)}
        </Text>
        {item.CreditHoursRequired ? <Text className="text-typography-500">{t('certifications.credits', { hours: item.CreditHours, required: item.CreditHoursRequired })}</Text> : null}
      </Pressable>
    ),
    [expiryText, open, t]
  );

  return (
    <View className="flex-1 bg-background-50" testID="certifications-screen">
      <HStack className="items-center justify-between px-4 pt-4">
        <Text className="text-xl font-bold text-typography-900" accessibilityRole="header">
          {t('certifications.title')}
        </Text>
        <Button size="sm" onPress={() => router.push(certificationsRoutes.edit())} accessibilityLabel={t('certifications.add')} testID="certifications-add">
          <View style={styles.icon}>
            <Plus size={16} color="#ffffff" />
          </View>
          <ButtonText>{t('certifications.add')}</ButtonText>
        </Button>
      </HStack>
      <VStack style={styles.flex} className="px-4 pt-3">
        {isLoading && !isRefreshing && items.length === 0 ? (
          <Loading />
        ) : error && items.length === 0 ? (
          <ZeroState isError heading={t('common.error')} description={t(certificationErrorKey(error))} testID="certifications-error">
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
            ListEmptyComponent={<ZeroState icon={Award} heading={t('certifications.none')} testID="certifications-empty" />}
            contentContainerStyle={styles.list}
            testID="certifications-list"
          />
        )}
      </VStack>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: 32 },
  icon: { marginRight: 4 },
});
