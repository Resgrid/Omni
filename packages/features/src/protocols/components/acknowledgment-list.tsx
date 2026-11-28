import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { isAcknowledgmentOwed, useProtocolAcknowledgmentsStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { ProtocolAcknowledgmentResultData } from '@resgrid/models';
import { FlatList, HStack, Loading, Pressable, RefreshControl, Text, useThemeColors, VStack, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { ClipboardCheck, Megaphone } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { acknowledgmentStatusKey, protocolKindKey } from '../lib/protocol-library';
import { protocolRoutes } from '../routes';

/** The acknowledgments the member still owes, bulletins first then the oldest due (Core's order is kept within those). */
export function owedAcknowledgments(list: readonly ProtocolAcknowledgmentResultData[]): ProtocolAcknowledgmentResultData[] {
  return list.filter(isAcknowledgmentOwed);
}

/**
 * "To acknowledge" (protocols plan P2): each protocol version the member must read and sign, with its due date and whether a
 * quiz is waiting. A row opens the protocol, where the member reads the version and signs it. Persisted for offline reading.
 */
export const AcknowledgmentList: React.FC = () => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const timeZone = useDepartmentTimeZone();
  const acknowledgments = useProtocolAcknowledgmentsStore((state) => state.acknowledgments);
  const isLoading = useProtocolAcknowledgmentsStore((state) => state.loading.mine === true);
  const error = useProtocolAcknowledgmentsStore((state) => state.errors.mine ?? null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const owed = useMemo(() => owedAcknowledgments(acknowledgments), [acknowledgments]);
  const held = useProtocolAcknowledgmentsStore((state) => state.held);
  const heldVersions = useMemo(() => new Set(held.map((item) => item.protocolVersionId)), [held]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await useProtocolAcknowledgmentsStore.getState().fetchAcknowledgments({ bypassCache: true });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void useProtocolAcknowledgmentsStore.getState().fetchAcknowledgments();
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ProtocolAcknowledgmentResultData }) => {
      const due = item.DueOn ? formatUtcInDepartmentTime(item.DueOn, timeZone, { dateStyle: 'medium' }) : '';
      const Icon = item.IsBulletin ? Megaphone : ClipboardCheck;

      return (
        <Pressable
          onPress={() => pushRoutePath(router, protocolRoutes.protocolDetail(String(item.ProtocolId)))}
          accessibilityRole="button"
          accessibilityHint={t('protocols.open_hint')}
          testID={`protocol-ack-${item.AcknowledgmentId}`}
          className="mb-2 rounded-xl border border-outline-100 bg-background-0 p-3"
        >
          <HStack space="md" className="items-center">
            <View>
              <Icon size={20} color={item.IsOverdue ? colors.error : colors.primary} />
            </View>
            <VStack className="flex-1">
              <Text className="font-semibold text-typography-900">{item.Name ?? item.Code ?? ''}</Text>
              <Text size="xs" className="text-typography-500">
                {[t(protocolKindKey(item.Kind)), item.VersionLabel ? t('protocols.version_label', { label: item.VersionLabel }) : null, due ? t('protocols.ack.due_on', { date: due }) : null].filter(Boolean).join(' · ')}
              </Text>
            </VStack>
            <Text size="xs" className={item.IsOverdue ? 'text-error-600' : 'text-typography-600'}>
              {t(heldVersions.has(item.ProtocolVersionId) ? 'protocols.ack.status_held' : acknowledgmentStatusKey(item))}
            </Text>
          </HStack>
        </Pressable>
      );
    },
    [colors.error, colors.primary, heldVersions, t, timeZone]
  );

  if (isLoading && owed.length === 0 && !isRefreshing) return <Loading />;

  return (
    <FlatList
      data={owed}
      keyExtractor={(item: ProtocolAcknowledgmentResultData) => String(item.AcknowledgmentId)}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
      ListEmptyComponent={
        error && acknowledgments.length === 0 ? (
          <ZeroState isError heading={t('protocols.ack.load_failed')} description={t(error.messageKey)} onRetry={refresh} testID="protocol-acks-error" />
        ) : (
          <ZeroState icon={ClipboardCheck} heading={t('protocols.ack.empty')} description={t('protocols.ack.empty_description')} onRetry={refresh} testID="protocol-acks-empty" />
        )
      }
      testID="protocol-acks"
    />
  );
};

const styles = StyleSheet.create({
  list: { padding: 12 },
});
