import { formatUtcInDepartmentTime, parseUtcMs } from '@resgrid/core/utils/dates';
import { DESK_PRESENCE_KEY, nextBreakOf, useDispatcherDeskStore } from '@resgrid/data';
import { OptionChips } from '@resgrid/features/calls';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { DispatcherBreakState, DispatcherBreakType, DispatcherDisplayState } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, Switch, Text, useToast } from '@resgrid/ui';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useDeskActions } from '../hooks/use-desk-actions';
import { useDispatcherDeskView } from '../hooks/use-dispatcher-desk';
import { useResetOnOpen } from '../hooks/use-reset-on-open';
import { BREAK_LENGTHS, BREAK_TYPES, breakTypeLabelKey } from '../lib/desk-format';

export interface TakeBreakSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Start this planned break (else the member's next planned one is offered, or a new one now). */
  plannedBreakId?: string | null;
}

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

/** The break lengths to offer: the department's default plan first, then the usual ones. */
export const breakLengthOptions = (planMinutes: readonly number[]): number[] => [...new Set([...planMinutes.filter((minutes) => minutes > 0), ...BREAK_LENGTHS])].sort((a, b) => a - b);

/**
 * Taking a break (plan D11). A break is a length: it can start early or late, and the dispatcher is due back its length
 * after it starts. The sheet offers the next planned break, or a new one now (type and minutes, defaulting from the
 * department's default plan). Work the dispatcher holds must go back to the queue first ("Return my work to the queue",
 * on while they hold any; off, the desk refuses). When the break would leave fewer dispatchers than the minimum the sheet
 * says so first; a department that prevents it refuses, and a supervisor can start it for them.
 */
export const TakeBreakSheet: React.FC<TakeBreakSheetProps> = ({ isOpen, onClose, plannedBreakId }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const { desk, me, config } = useDispatcherDeskView();
  const actions = useDeskActions();
  const toast = useToast();
  const busy = useDispatcherDeskStore((state) => state.busyKeys.includes(DESK_PRESENCE_KEY));
  const plan = useMemo(() => config?.DefaultBreakPlan ?? [], [config?.DefaultBreakPlan]);

  const planned = useMemo(() => {
    const breaks = (desk?.MyBreaks ?? []).filter((entry) => entry.State === DispatcherBreakState.Scheduled);

    return breaks.find((entry) => entry.DispatcherBreakId === plannedBreakId) ?? nextBreakOf(me, breaks);
  }, [desk?.MyBreaks, me, plannedBreakId]);

  const [usePlanned, setUsePlanned] = useState(true);
  const [breakType, setBreakType] = useState<number>(DispatcherBreakType.Break);
  const [minutes, setMinutes] = useState(15);
  const [returnWork, setReturnWork] = useState(true);
  const [refusal, setRefusal] = useState<string | null>(null);
  const holding = me?.ActiveItemCount ?? 0;
  // Who would still be available: the member counts only while they are available themselves (busy or away, they are not).
  const availableAfter = Math.max(0, (desk?.AvailableCount ?? 0) - (me?.DisplayState === DispatcherDisplayState.Available ? 1 : 0));
  const belowMinimum = !!desk && availableAfter < desk.MinimumAvailable;
  const lengths = useMemo(() => breakLengthOptions(plan.map((entry) => entry.DurationMinutes)), [plan]);

  useResetOnOpen(isOpen, () => {
    const first = plan[0];
    setUsePlanned(!!planned);
    setBreakType(first?.BreakType ?? DispatcherBreakType.Break);
    setMinutes(first?.DurationMinutes && first.DurationMinutes > 0 ? first.DurationMinutes : 15);
    setReturnWork(true);
    setRefusal(null);
  });

  const startingPlanned = usePlanned && !!planned;
  const length = startingPlanned ? (planned?.DurationMinutes ?? minutes) : minutes;
  const dueBack = new Date(Date.now() + length * 60000).toISOString();

  const submit = async () => {
    setRefusal(null);

    const outcome = await actions.run(
      () =>
        useDispatcherDeskStore.getState().startBreak({
          DispatcherBreakId: startingPlanned ? (planned?.DispatcherBreakId ?? null) : null,
          BreakType: startingPlanned ? null : breakType,
          DurationMinutes: startingPlanned ? null : minutes,
          ReturnWork: holding > 0 ? returnWork : false,
        }),
      { handledRefusals: ['HoldingWork', 'CoverageTooLow'] }
    );

    if (outcome.ok) {
      const expected = outcome.result?.Me?.ActiveBreak?.ExpectedReturnOn ?? dueBack;
      toast.success(t('dispatcher_desk.breaks.started', { time: formatUtcInDepartmentTime(expected, timeZone, TIME) }));
      onClose();
    } else if (outcome.refusal === 'HoldingWork' || outcome.refusal === 'CoverageTooLow') {
      setRefusal(outcome.refusal);

      if (outcome.refusal === 'HoldingWork') setReturnWork(true);
    }
  };

  const plannedStart = planned ? parseUtcMs(planned.ScheduledStartOn) : null;

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={busy} snapPoints={[80]} testID="desk-take-break-sheet">
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text className="mb-3 text-center text-lg font-bold text-typography-900" accessibilityRole="header">
          {t('dispatcher_desk.breaks.take_title')}
        </Text>

        {planned ? (
          <OptionChips
            options={[
              {
                value: 'planned',
                label: t('dispatcher_desk.breaks.start_planned', {
                  type: t(breakTypeLabelKey(planned.BreakType)),
                  minutes: planned.DurationMinutes,
                  time: plannedStart === null ? '' : formatUtcInDepartmentTime(planned.ScheduledStartOn, timeZone, TIME),
                }),
              },
              { value: 'now', label: t('dispatcher_desk.breaks.take_new') },
            ]}
            selected={[startingPlanned ? 'planned' : 'now']}
            onToggle={(value) => setUsePlanned(value === 'planned')}
            accessibilityLabel={t('dispatcher_desk.breaks.take_title')}
            testID="desk-break-which"
          />
        ) : null}

        {startingPlanned ? null : (
          <View className="mt-2">
            <Text size="sm" className="mb-1 font-medium text-typography-700">
              {t('dispatcher_desk.breaks.type')}
            </Text>
            <OptionChips
              options={BREAK_TYPES.map((type) => ({ value: type, label: t(breakTypeLabelKey(type)) }))}
              selected={[breakType]}
              onToggle={setBreakType}
              accessibilityLabel={t('dispatcher_desk.breaks.type')}
              testID="desk-break-type"
            />
            <Text size="sm" className="mb-1 mt-3 font-medium text-typography-700">
              {t('dispatcher_desk.breaks.length')}
            </Text>
            <OptionChips
              options={lengths.map((value) => ({ value, label: t('dispatcher_desk.breaks.minutes', { minutes: value }) }))}
              selected={[minutes]}
              onToggle={setMinutes}
              accessibilityLabel={t('dispatcher_desk.breaks.length')}
              testID="desk-break-length"
            />
          </View>
        )}

        <Text size="sm" className="mt-3 text-typography-700" testID="desk-break-due-back">
          {t('dispatcher_desk.breaks.due_back_at', { time: formatUtcInDepartmentTime(dueBack, timeZone, TIME) })}
        </Text>

        {holding > 0 ? (
          <View style={styles.row} className={`mt-3 rounded-lg border p-3 ${refusal === 'HoldingWork' ? 'border-error-300 bg-error-50' : 'border-outline-200'}`} testID="desk-break-holding">
            <View style={styles.rowText}>
              <Text className="font-medium text-typography-900">{t('dispatcher_desk.breaks.return_work', { count: holding })}</Text>
              <Text size="xs" className="text-typography-500">
                {t(refusal === 'HoldingWork' ? 'dispatcher_desk.errors.holding_work' : 'dispatcher_desk.breaks.return_work_hint')}
              </Text>
            </View>
            <Switch value={returnWork} onValueChange={setReturnWork} accessibilityLabel={t('dispatcher_desk.breaks.return_work', { count: holding })} testID="desk-break-return-work" />
          </View>
        ) : null}

        {belowMinimum || refusal === 'CoverageTooLow' ? (
          <View
            className={`mt-3 rounded-lg border p-3 ${refusal === 'CoverageTooLow' ? 'border-error-300 bg-error-50' : 'border-warning-300 bg-background-warning'}`}
            accessibilityRole="alert"
            testID="desk-break-coverage"
          >
            <Text size="sm" className={refusal === 'CoverageTooLow' ? 'text-error-800' : 'text-warning-800'}>
              {refusal === 'CoverageTooLow'
                ? t('dispatcher_desk.breaks.coverage_refused')
                : t(config?.PreventBreakBelowMinimum ? 'dispatcher_desk.breaks.coverage_prevented' : 'dispatcher_desk.breaks.coverage_warning', {
                    available: availableAfter,
                    minimum: desk?.MinimumAvailable ?? 0,
                  })}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button variant="outline" className="mr-2 flex-1" onPress={onClose} isDisabled={busy} accessibilityLabel={t('common.cancel')}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button
            className="flex-1"
            action={belowMinimum ? 'negative' : 'primary'}
            onPress={() => void submit()}
            isDisabled={busy}
            accessibilityLabel={t(belowMinimum ? 'dispatcher_desk.breaks.take_anyway' : 'dispatcher_desk.actions.take_break')}
            testID="desk-break-submit"
          >
            <ButtonText>{t(belowMinimum ? 'dispatcher_desk.breaks.take_anyway' : 'dispatcher_desk.actions.take_break')}</ButtonText>
          </Button>
        </View>
      </ScrollView>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowText: { flex: 1, marginRight: 8 },
  actions: { flexDirection: 'row', marginTop: 16, marginBottom: 8 },
});
