import { useTerm } from '@resgrid/auth';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useTranslation } from '@resgrid/i18n';
import { ScreenHeader, View, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ShiftActionSheet } from '../components/shift-action-sheet';
import { ShiftTradeDetails } from '../components/shift-trade-details';
import type { ShiftSheetAction } from '../lib/shift-action-types';

export interface ShiftTradeScreenProps {
  /** Defaults to the `id` route param. */
  tradeId?: string;
}

/** One trade as its own screen (trade push notifications: `/shifts/trade/[id]`), with its confirmations. */
export default function ShiftTradeScreen({ tradeId }: ShiftTradeScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const title = useTerm('module.shifts', t('shifts.title'));
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = tradeId ?? (routeId && isSafeRouteId(routeId) ? routeId : '');
  const [action, setAction] = useState<ShiftSheetAction | null>(null);

  return (
    <View className="flex-1 bg-background-0" testID="shift-trade-screen">
      <ScreenHeader title={title} onBack={() => router.back()} testID="shift-trade-header" />
      {id ? (
        <ScrollView contentContainerStyle={styles.content}>
          <ShiftTradeDetails tradeId={id} onAction={setAction} />
        </ScrollView>
      ) : (
        <ZeroState isError heading={t('shifts.errors.not_found')} testID="shift-trade-invalid" />
      )}
      <ShiftActionSheet action={action} onClose={() => setAction(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
});
