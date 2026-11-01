import { useTerm } from '@resgrid/auth';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useTranslation } from '@resgrid/i18n';
import { ScreenHeader, View, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ShiftDayDetails } from '../components/shift-day-details';

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export interface ShiftDayScreenProps {
  /** Defaults to the `id` route param. */
  shiftDayId?: string;
  /** Defaults to the `workshift` route param (`1`/`true`): static shift days load from their own endpoint. */
  workshift?: boolean;
}

/** A shift day as its own screen (push notifications and links: `/shifts/day/[id]`); the list opens days in a sheet. */
export default function ShiftDayScreen({ shiftDayId, workshift }: ShiftDayScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const title = useTerm('module.shifts', t('shifts.title'));
  const params = useLocalSearchParams<{ id?: string | string[]; workshift?: string | string[] }>();
  const routeId = first(params.id);
  const id = shiftDayId ?? (routeId && isSafeRouteId(routeId) ? routeId : '');
  const isWorkshift = workshift ?? ['1', 'true'].includes(first(params.workshift) ?? '');

  return (
    <View className="flex-1 bg-background-0" testID="shift-day-screen">
      <ScreenHeader title={title} onBack={() => router.back()} testID="shift-day-header" />
      {id ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ShiftDayDetails shiftDayId={id} workshift={isWorkshift} />
        </ScrollView>
      ) : (
        <ZeroState isError heading={t('shifts.errors.not_found')} testID="shift-day-invalid" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
});
