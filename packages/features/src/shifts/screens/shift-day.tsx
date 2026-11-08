import { useTerm } from '@resgrid/auth';
import { replaceRoutePath } from '@resgrid/core/navigation/route-paths';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useShiftsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { KeyboardAwareScrollView, ScreenHeader, View, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

import { ShiftDayDetails } from '../components/shift-day-details';
import { useListedShiftDay } from '../hooks/use-listed-shift-day';
import { shiftRoutes } from '../routes';

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export interface ShiftDayScreenProps {
  /** Defaults to the `id` route param. */
  shiftDayId?: string;
  /** Defaults to the `workshift` route param (`1`/`true`): static shift days load from their own endpoint. */
  workshift?: boolean;
}

/**
 * A shift day as its own screen at `/shifts/day/[id]`, opened from the Shifts lists and calendar, push notifications and
 * links. A day picked from a list shows its light copy at once while the full day (roster, needs) loads. Back returns to
 * the Shifts screen as it was left (view, calendar month and picked day); opened cold, it goes to Shifts.
 */
export default function ShiftDayScreen({ shiftDayId, workshift }: ShiftDayScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const moduleTitle = useTerm('module.shifts', t('shifts.title'));
  const params = useLocalSearchParams<{ id?: string | string[]; workshift?: string | string[] }>();
  const routeId = first(params.id);
  const id = shiftDayId ?? (routeId && isSafeRouteId(routeId) ? routeId : '');
  const isWorkshift = workshift ?? ['1', 'true'].includes(first(params.workshift) ?? '');
  const listed = useListedShiftDay(id, isWorkshift);
  const loadedName = useShiftsStore((state) => (id ? state.shiftDaysById[id]?.ShiftName : undefined));
  const title = loadedName || listed?.ShiftName || moduleTitle;

  const back = () => (router.canGoBack() ? router.back() : replaceRoutePath(router, shiftRoutes.list()));

  return (
    <View className="flex-1 bg-background-0" testID="shift-day-screen">
      <ScreenHeader title={title} onBack={back} testID="shift-day-header" />
      {id ? (
        <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ShiftDayDetails shiftDayId={id} fallback={listed} workshift={isWorkshift} />
        </KeyboardAwareScrollView>
      ) : (
        <ZeroState isError heading={t('shifts.errors.not_found')} testID="shift-day-invalid" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
});
