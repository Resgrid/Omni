import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useDispatcherDeskStore } from '@resgrid/data';
import { OptionChips } from '@resgrid/features/calls';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { type DispatcherBreakData, DispatcherBreakState, DispatcherBreakType } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, DateTimeField, HStack, Text, VStack } from '@resgrid/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useDeskActions } from '../hooks/use-desk-actions';
import { useDispatcherDeskView } from '../hooks/use-dispatcher-desk';
import { BREAK_TYPES, breakTypeLabelKey } from '../lib/desk-format';
import { breakLengthOptions } from './take-break-sheet';

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

export interface PlanBreakTarget {
  /** Whose breaks: null for the member's own. */
  userId: string | null;
  name: string;
}

export interface PlanBreakSheetProps {
  target: PlanBreakTarget | null;
  onClose: () => void;
}

const isOpenBreak = (entry: DispatcherBreakData): boolean => entry.State === DispatcherBreakState.Scheduled || entry.State === DispatcherBreakState.Active;

/**
 * A dispatcher's breaks today, to plan, change or cancel (their own, or anyone's for a supervisor): a planned break is a
 * type, a start and a length, and the dispatcher is due back its length after they start it. A supervisor can also start
 * a dispatcher's break now (their work goes back to the queue) or end a running one.
 */
export const PlanBreakSheet: React.FC<PlanBreakSheetProps> = ({ target, onClose }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const { desk, me, config } = useDispatcherDeskView();
  const coverage = useDispatcherDeskStore((state) => state.coverage);
  const busyKeys = useDispatcherDeskStore((state) => state.busyKeys);
  const actions = useDeskActions();
  const isOpen = target !== null;
  const userId = target?.userId ?? null;
  const isMine = userId === null || userId === me?.UserId;
  const breaks = useMemo(() => (isMine ? (desk?.MyBreaks ?? []) : (coverage?.Breaks ?? []).filter((entry) => entry.UserId === userId)).filter(isOpenBreak), [coverage?.Breaks, desk?.MyBreaks, isMine, userId]);
  const lengths = useMemo(() => breakLengthOptions((config?.DefaultBreakPlan ?? []).map((entry) => entry.DurationMinutes)), [config?.DefaultBreakPlan]);
  const [editing, setEditing] = useState<string | null>(null);
  const [breakType, setBreakType] = useState<number>(DispatcherBreakType.Break);
  const [minutes, setMinutes] = useState(15);
  const [startOn, setStartOn] = useState('');
  const busy = busyKeys.some((key) => key.startsWith('break:'));
  const shiftDayId = isMine ? (me?.Duty?.ShiftDayId ?? null) : ((desk?.Members ?? []).find((member) => member.UserId === userId)?.Duty?.ShiftDayId ?? null);

  const startForm = (entry: DispatcherBreakData | null) => {
    setEditing(entry?.DispatcherBreakId ?? null);
    setBreakType(entry?.BreakType ?? config?.DefaultBreakPlan?.[0]?.BreakType ?? DispatcherBreakType.Break);
    setMinutes(entry?.DurationMinutes ?? config?.DefaultBreakPlan?.[0]?.DurationMinutes ?? 15);
    setStartOn(entry?.ScheduledStartOn ?? new Date(Math.ceil(Date.now() / 900000) * 900000).toISOString());
  };

  useEffect(() => {
    if (isOpen) startForm(null);
    // Only when the sheet opens for someone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  const refreshCoverage = () => void useDispatcherDeskStore.getState().fetchCoverage(undefined, { bypassCache: true });

  const save = async () => {
    if (!startOn) return;

    const outcome = await actions.run(
      () =>
        useDispatcherDeskStore.getState().saveBreak({
          DispatcherBreakId: editing,
          UserId: isMine ? null : userId,
          ShiftDayId: shiftDayId,
          BreakType: breakType,
          ScheduledStartOn: startOn,
          DurationMinutes: minutes,
        }),
      { success: t('dispatcher_desk.plan.saved') }
    );

    if (outcome.ok) {
      startForm(null);
      refreshCoverage();
    }
  };

  const cancelBreak = async (entry: DispatcherBreakData) => {
    const outcome = await actions.run(() => useDispatcherDeskStore.getState().cancelBreak(entry.DispatcherBreakId), { success: t('dispatcher_desk.plan.cancelled') });

    if (outcome.ok) refreshCoverage();
  };

  const startNow = async () => {
    if (!userId || isMine) return;

    const outcome = await actions.run(() => useDispatcherDeskStore.getState().startBreak({ UserId: userId, BreakType: breakType, DurationMinutes: minutes, ReturnWork: true }), {
      success: t('dispatcher_desk.plan.started_for', { name: target?.name ?? '' }),
    });

    if (outcome.ok) refreshCoverage();
  };

  const endBreak = async () => {
    const outcome = await actions.run(() => useDispatcherDeskStore.getState().endBreak(isMine ? null : userId), { success: t('dispatcher_desk.actions.im_back_done') });

    if (outcome.ok) refreshCoverage();
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={busy} snapPoints={[85]} testID="desk-plan-break-sheet">
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text className="mb-3 text-center text-lg font-bold text-typography-900" accessibilityRole="header">
          {isMine ? t('dispatcher_desk.plan.title_mine') : t('dispatcher_desk.plan.title_for', { name: target?.name ?? '' })}
        </Text>

        <VStack space="xs" className="mb-3">
          {breaks.length === 0 ? (
            <Text size="sm" className="text-typography-500" testID="desk-plan-none">
              {t('dispatcher_desk.plan.none')}
            </Text>
          ) : null}
          {breaks.map((entry) => {
            const active = entry.State === DispatcherBreakState.Active;
            const start = active ? entry.StartedOn : entry.ScheduledStartOn;
            const end = active ? entry.ExpectedReturnOn : entry.ScheduledEndOn;

            return (
              <View key={entry.DispatcherBreakId} className={`rounded-lg border p-2 ${active ? 'border-warning-400 bg-background-warning' : 'border-outline-200'}`} testID={`desk-plan-${entry.DispatcherBreakId}`}>
                <Text className="font-medium text-typography-900">
                  {t('dispatcher_desk.plan.entry', {
                    type: t(breakTypeLabelKey(entry.BreakType)),
                    minutes: entry.DurationMinutes,
                    start: start ? formatUtcInDepartmentTime(start, timeZone, TIME) : '',
                    end: end ? formatUtcInDepartmentTime(end, timeZone, TIME) : '',
                  })}
                </Text>
                <HStack className="mt-1 flex-wrap">
                  {active ? (
                    <Button size="sm" variant="outline" action="secondary" className="mr-2 min-h-[40px]" onPress={() => void endBreak()} isDisabled={busy} testID={`desk-plan-${entry.DispatcherBreakId}-end`}>
                      <ButtonText>{t('dispatcher_desk.team.end_break')}</ButtonText>
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" action="secondary" className="mr-2 min-h-[40px]" onPress={() => startForm(entry)} isDisabled={busy} testID={`desk-plan-${entry.DispatcherBreakId}-edit`}>
                        <ButtonText>{t('dispatcher_desk.plan.edit')}</ButtonText>
                      </Button>
                      <Button size="sm" variant="outline" action="negative" className="mr-2 min-h-[40px]" onPress={() => void cancelBreak(entry)} isDisabled={busy} testID={`desk-plan-${entry.DispatcherBreakId}-cancel`}>
                        <ButtonText>{t('dispatcher_desk.plan.cancel')}</ButtonText>
                      </Button>
                    </>
                  )}
                </HStack>
              </View>
            );
          })}
        </VStack>

        <Text className="mb-2 font-semibold text-typography-900">{editing ? t('dispatcher_desk.plan.edit_title') : t('dispatcher_desk.plan.add_title')}</Text>
        <Text size="sm" className="mb-1 font-medium text-typography-700">
          {t('dispatcher_desk.breaks.type')}
        </Text>
        <OptionChips
          options={BREAK_TYPES.map((type) => ({ value: type, label: t(breakTypeLabelKey(type)) }))}
          selected={[breakType]}
          onToggle={setBreakType}
          accessibilityLabel={t('dispatcher_desk.breaks.type')}
          testID="desk-plan-type"
        />
        <Text size="sm" className="mb-1 mt-3 font-medium text-typography-700">
          {t('dispatcher_desk.breaks.length')}
        </Text>
        <OptionChips
          options={lengths.map((value) => ({ value, label: t('dispatcher_desk.breaks.minutes', { minutes: value }) }))}
          selected={[minutes]}
          onToggle={setMinutes}
          accessibilityLabel={t('dispatcher_desk.breaks.length')}
          testID="desk-plan-length"
        />
        <View className="mt-3">
          <DateTimeField mode="datetime" value={startOn} onChange={setStartOn} label={t('dispatcher_desk.plan.start')} clearable={false} testID="desk-plan-start" />
        </View>
        <Text size="xs" className="mt-1 text-typography-500">
          {t('dispatcher_desk.plan.length_hint')}
        </Text>

        <View style={styles.actions}>
          {editing ? (
            <Button variant="outline" className="mr-2 flex-1" onPress={() => startForm(null)} isDisabled={busy} accessibilityLabel={t('common.cancel')}>
              <ButtonText>{t('common.cancel')}</ButtonText>
            </Button>
          ) : null}
          {!isMine && !editing ? (
            <Button variant="outline" action="secondary" className="mr-2 flex-1" onPress={() => void startNow()} isDisabled={busy} accessibilityLabel={t('dispatcher_desk.plan.start_now')} testID="desk-plan-start-now">
              <ButtonText>{t('dispatcher_desk.plan.start_now')}</ButtonText>
            </Button>
          ) : null}
          <Button className="flex-1" onPress={() => void save()} isDisabled={busy || !startOn} accessibilityLabel={t('dispatcher_desk.plan.save')} testID="desk-plan-save">
            <ButtonText>{t('dispatcher_desk.plan.save')}</ButtonText>
          </Button>
        </View>
      </ScrollView>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  actions: { flexDirection: 'row', marginTop: 16, marginBottom: 8 },
});
