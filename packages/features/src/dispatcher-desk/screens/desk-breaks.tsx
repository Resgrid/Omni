import { replaceRoutePath } from '@resgrid/core/navigation/route-paths';
import { formatUtcInDepartmentTime, parseUtcMs } from '@resgrid/core/utils/dates';
import { breakDueBackMs, deskRosterKey, plannedBreakEndMs, useDispatcherDeskStore } from '@resgrid/data';
import { CallConfirmDialog } from '@resgrid/features/calls';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { type DispatcherBreakData, DispatcherBreakState, DispatcherDutyMode } from '@resgrid/models';
import { useRealtimeRefetch } from '@resgrid/realtime';
import { Button, ButtonText, HStack, Loading, RefreshControl, ScreenHeader, Switch, Text, VStack, ZeroState } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { Headset } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CoverageTimelineView } from '../components/coverage-timeline-view';
import { DeskPill } from '../components/desk-pill';
import { PlanBreakSheet, type PlanBreakTarget } from '../components/plan-break-sheet';
import { useDeskActions } from '../hooks/use-desk-actions';
import { noteOwnBreakEnd } from '../hooks/use-desk-alerts';
import { useDispatcherDeskView, useIsDispatcherDeskEnabled, useNow } from '../hooks/use-dispatcher-desk';
import { breakTypeLabelKey, describeWarning, formatCountdown } from '../lib/desk-format';
import { openDeskSheet } from '../lib/desk-ui-store';
import { dispatcherDeskRoutes } from '../routes';

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

const COVERAGE_REFRESH_EVENTS = ['dispatcherDeskUpdated', 'eventingHubJoined'] as const;

const breakStateKey = (state: number): string =>
  state === DispatcherBreakState.Active ? 'dispatcher_desk.break_state.active' : state === DispatcherBreakState.Scheduled ? 'dispatcher_desk.break_state.planned' : 'dispatcher_desk.break_state.done';

/** One of the member's breaks today: when, how long, when they are (or would be) due back, and what they can do with it. */
const MyBreakRow: React.FC<{ entry: DispatcherBreakData; now: number; timeZone: string | null; onEdit: () => void }> = ({ entry, now, timeZone, onEdit }) => {
  const { t } = useTranslation();
  const actions = useDeskActions();
  const active = entry.State === DispatcherBreakState.Active;
  // Only a planned break can be started or changed; a finished, missed or cancelled one is shown, not acted on.
  const planned = entry.State === DispatcherBreakState.Scheduled;
  const dueBack = active ? breakDueBackMs(entry) : plannedBreakEndMs(entry);
  const start = active ? entry.StartedOn : entry.ScheduledStartOn;
  const overdue = active && dueBack !== null && now > dueBack;

  return (
    <View
      className={`mb-2 rounded-xl border p-3 ${overdue ? 'border-error-300 bg-error-50' : active ? 'border-warning-300 bg-background-warning' : 'border-outline-200 bg-background-0'}`}
      testID={`desk-my-break-${entry.DispatcherBreakId}`}
    >
      <HStack className="items-center justify-between">
        <Text className="font-semibold text-typography-900">{t('dispatcher_desk.breaks.row', { type: t(breakTypeLabelKey(entry.BreakType)), minutes: entry.DurationMinutes })}</Text>
        <DeskPill label={t(breakStateKey(entry.State))} tone={overdue ? 'error' : active ? 'warning' : 'muted'} />
      </HStack>
      <Text size="sm" className="mt-1 text-typography-700">
        {t(active ? 'dispatcher_desk.breaks.started_at' : 'dispatcher_desk.breaks.planned_at', { time: start ? formatUtcInDepartmentTime(start, timeZone, TIME) : '' })}
        {dueBack !== null ? ` · ${t('dispatcher_desk.breaks.due_back_at', { time: formatUtcInDepartmentTime(new Date(dueBack).toISOString(), timeZone, TIME) })}` : ''}
      </Text>
      {active && dueBack !== null ? (
        <Text size="sm" className={`font-semibold ${overdue ? 'text-error-700' : 'text-warning-800'}`} testID="desk-my-break-countdown">
          {overdue ? t('dispatcher_desk.breaks.overdue_by', { time: formatCountdown(now - dueBack) }) : t('dispatcher_desk.breaks.left', { time: formatCountdown(dueBack - now) })}
        </Text>
      ) : null}
      <HStack className="mt-2 flex-wrap">
        {active ? (
          <Button
            size="md"
            className="mr-2 min-h-[44px]"
            onPress={() => {
              noteOwnBreakEnd();
              void actions.run(() => useDispatcherDeskStore.getState().endBreak(), { success: t('dispatcher_desk.actions.im_back_done') });
            }}
            testID="desk-my-break-end"
          >
            <ButtonText>{t('dispatcher_desk.actions.im_back')}</ButtonText>
          </Button>
        ) : planned ? (
          <>
            <Button size="md" className="mr-2 min-h-[44px]" onPress={() => openDeskSheet('takeBreak', { plannedBreakId: entry.DispatcherBreakId })} testID={`desk-my-break-${entry.DispatcherBreakId}-start`}>
              <ButtonText>{t('dispatcher_desk.breaks.start_now')}</ButtonText>
            </Button>
            <Button size="md" variant="outline" action="secondary" className="mr-2 min-h-[44px]" onPress={onEdit} testID={`desk-my-break-${entry.DispatcherBreakId}-edit`}>
              <ButtonText>{t('dispatcher_desk.plan.edit')}</ButtonText>
            </Button>
          </>
        ) : null}
      </HStack>
    </View>
  );
};

/**
 * Breaks (`/desk/breaks`, plan D11): the member's duty window and breaks today — start a planned one (early or late: a
 * break is a length, due back its length after it starts), take one now, plan or change one, "I'm back" — and the whole
 * team's timeline with the coverage lane, so breaks do not overlap and coverage stays above the minimum. Supervisors open
 * any dispatcher's breaks from the timeline or stagger the shift's break plan across the day's dispatchers.
 */
export default function DeskBreaksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const enabled = useIsDispatcherDeskEnabled();
  const timeZone = useDepartmentTimeZone();
  const { desk, me, isAvailable, isSignedIn } = useDispatcherDeskView();
  const coverage = useDispatcherDeskStore((state) => state.coverage);
  const coverageLoading = useDispatcherDeskStore((state) => state.loading.coverage === true);
  const busyKeys = useDispatcherDeskStore((state) => state.busyKeys);
  const actions = useDeskActions();
  const now = useNow(1000, isAvailable);
  const [refreshing, setRefreshing] = useState(false);
  const [planTarget, setPlanTarget] = useState<PlanBreakTarget | null>(null);
  const [planConfirm, setPlanConfirm] = useState(false);
  const [replacePlan, setReplacePlan] = useState(false);
  const shiftDayId = me?.Duty?.ShiftDayId ?? null;
  const canSupervise = me?.CanSupervise === true;

  const loadCoverage = useCallback(() => useDispatcherDeskStore.getState().fetchCoverage(undefined, { bypassCache: true }), []);

  useEffect(() => {
    if (isAvailable) void loadCoverage();
  }, [isAvailable, loadCoverage]);

  useRealtimeRefetch(COVERAGE_REFRESH_EVENTS, () => loadCoverage(), isAvailable);

  const refresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await Promise.all([useDispatcherDeskStore.getState().fetchDesk({ bypassCache: true }), loadCoverage()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadCoverage]);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else replaceRoutePath(router, dispatcherDeskRoutes.desk());
  }, [router]);

  if (!enabled) return <ZeroState heading={t('dispatcher_desk.not_available')} icon={Headset} testID="desk-breaks-disabled" />;

  if (!isAvailable || !desk) {
    return (
      <View className="flex-1 bg-background-50" testID="desk-breaks-screen">
        <ScreenHeader title={t('dispatcher_desk.breaks.title')} onBack={back} />
        <ZeroState heading={t('dispatcher_desk.not_dispatcher')} onRetry={refresh} testID="desk-breaks-unavailable" />
      </View>
    );
  }

  const myBreaks = [...(desk.MyBreaks ?? [])].sort(
    (a, b) => Number(b.State === DispatcherBreakState.Active) - Number(a.State === DispatcherBreakState.Active) || (parseUtcMs(a.ScheduledStartOn) ?? 0) - (parseUtcMs(b.ScheduledStartOn) ?? 0)
  );

  const duty = me?.Duty;

  const dutyLine =
    me?.DutyMode === DispatcherDutyMode.Unscheduled
      ? t('dispatcher_desk.team.unscheduled', { time: me.DutyEndsOn ? formatUtcInDepartmentTime(me.DutyEndsOn, timeZone, TIME) : t('dispatcher_desk.team.open') })
      : duty
        ? t('dispatcher_desk.breaks.duty', {
            shift: duty.ShiftName ?? '',
            start: duty.StartUtc ? formatUtcInDepartmentTime(duty.StartUtc, timeZone, TIME) : '',
            end: duty.EndUtc ? formatUtcInDepartmentTime(duty.EndUtc, timeZone, TIME) : '',
          })
        : t('dispatcher_desk.team.no_shift');

  const onBreak = myBreaks.some((entry) => entry.State === DispatcherBreakState.Active);

  return (
    <View className="flex-1 bg-background-50" testID="desk-breaks-screen">
      <ScreenHeader title={t('dispatcher_desk.breaks.title')} onBack={back} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
        <Text className="mb-1 font-semibold text-typography-900">{t('dispatcher_desk.breaks.my_duty')}</Text>
        <Text size="sm" className="mb-3 text-typography-700" testID="desk-breaks-duty">
          {dutyLine}
        </Text>

        <HStack className="mb-2 items-center justify-between">
          <Text className="font-semibold text-typography-900">{t('dispatcher_desk.breaks.my_breaks')}</Text>
        </HStack>
        {myBreaks.length === 0 ? (
          <Text size="sm" className="mb-2 text-typography-500" testID="desk-breaks-none">
            {t('dispatcher_desk.plan.none')}
          </Text>
        ) : null}
        {myBreaks.map((entry) => (
          <MyBreakRow key={entry.DispatcherBreakId} entry={entry} now={now} timeZone={timeZone} onEdit={() => setPlanTarget({ userId: null, name: me?.Name ?? '' })} />
        ))}
        <HStack className="mb-4 flex-wrap">
          {isSignedIn && !onBreak ? (
            <Button size="md" className="mb-2 mr-2 min-h-[44px]" onPress={() => openDeskSheet('takeBreak')} testID="desk-breaks-take-now">
              <ButtonText>{t('dispatcher_desk.breaks.take_now')}</ButtonText>
            </Button>
          ) : null}
          <Button size="md" variant="outline" action="secondary" className="mb-2 mr-2 min-h-[44px]" onPress={() => setPlanTarget({ userId: null, name: me?.Name ?? '' })} testID="desk-breaks-plan-mine">
            <ButtonText>{t('dispatcher_desk.breaks.plan_mine')}</ButtonText>
          </Button>
          {canSupervise && shiftDayId ? (
            <Button size="md" variant="outline" action="secondary" className="mb-2 mr-2 min-h-[44px]" onPress={() => setPlanConfirm(true)} testID="desk-breaks-plan-shift">
              <ButtonText>{t('dispatcher_desk.breaks.plan_shift')}</ButtonText>
            </Button>
          ) : null}
        </HStack>

        <Text className="mb-1 font-semibold text-typography-900">{t('dispatcher_desk.timeline.title')}</Text>
        <Text size="xs" className="mb-2 text-typography-500">
          {t(canSupervise ? 'dispatcher_desk.timeline.hint_supervisor' : 'dispatcher_desk.timeline.hint')}
        </Text>
        {coverage ? (
          <CoverageTimelineView coverage={coverage} now={now} onPressRow={canSupervise ? (userId, name) => setPlanTarget({ userId, name }) : undefined} />
        ) : coverageLoading ? (
          <Loading text={t('dispatcher_desk.timeline.loading')} />
        ) : (
          <ZeroState heading={t('dispatcher_desk.timeline.unavailable')} onRetry={loadCoverage} testID="desk-breaks-timeline-error" />
        )}
        {(coverage?.Warnings ?? []).length > 0 ? (
          <VStack space="xs" className="mt-3" testID="desk-breaks-warnings">
            {(coverage?.Warnings ?? []).map((warning, index) => (
              <Text key={`${warning.Kind}-${warning.StartUtc ?? index}`} size="sm" className="text-warning-800">
                {describeWarning(warning, t)}
                {warning.StartUtc ? ` (${formatUtcInDepartmentTime(warning.StartUtc, timeZone, TIME)})` : ''}
              </Text>
            ))}
          </VStack>
        ) : null}
      </ScrollView>

      <PlanBreakSheet target={planTarget} onClose={() => setPlanTarget(null)} />
      <CallConfirmDialog
        isOpen={planConfirm}
        title={t('dispatcher_desk.breaks.plan_shift')}
        message={t('dispatcher_desk.breaks.plan_shift_message')}
        confirmLabel={t('dispatcher_desk.breaks.plan_shift_confirm')}
        cancelLabel={t('common.cancel')}
        isBusy={shiftDayId ? busyKeys.includes(deskRosterKey(shiftDayId)) : false}
        onConfirm={() => {
          if (!shiftDayId) return;
          void actions
            .run(() => useDispatcherDeskStore.getState().planBreaks(shiftDayId, replacePlan), { success: t('dispatcher_desk.breaks.plan_shift_done') })
            .then((outcome) => {
              if (outcome.ok) {
                setPlanConfirm(false);
                void loadCoverage();
              }
            });
        }}
        onCancel={() => setPlanConfirm(false)}
        testID="desk-plan-shift-dialog"
      >
        <HStack className="items-center justify-between">
          <Text size="sm" className="mr-2 flex-1 text-typography-700">
            {t('dispatcher_desk.breaks.plan_shift_replace')}
          </Text>
          <Switch value={replacePlan} onValueChange={setReplacePlan} accessibilityLabel={t('dispatcher_desk.breaks.plan_shift_replace')} testID="desk-plan-shift-replace" />
        </HStack>
      </CallConfirmDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
});
