import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { recurringScheduleKey, useCallsStore, useRecurringCallsStore } from '@resgrid/data';
import { CallConfirmDialog, callDisplayName, callRoutes, resolvePriority, useCallDispatchNow, useDispatchRecipients } from '@resgrid/features/calls';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { RecurringCallUpcomingCallData } from '@resgrid/models';
import { useRealtimeRefetch } from '@resgrid/realtime';
import { KeyboardAwareScrollView, Loading, Pressable, ScreenHeader, Switch, Text, useThemeColors, useToast, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BellRing, CalendarDays, ChevronRight, Pause, Pencil, Play, Send, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '../components/action-button';
import { PauseRecurringCallDialog, type PauseRecurringCallValues } from '../components/pause-recurring-call-dialog';
import { type PillTone, StatusPill } from '../components/status-pill';
import { useIsRecurringCallsEnabled } from '../hooks/use-recurring-calls';
import { describeMode, describeSchedule, formatDateKey, joinParts, modeLabelKey, recurringCallStatus, scheduleName, STATUS_LABEL_KEYS } from '../lib/schedule-format';
import { summarizeNames, targetNames } from '../lib/targets';
import { recurringCallsRoutes } from '../routes';

export interface RecurringCallDetailScreenProps {
  /** Defaults to the `id` route param. */
  recurringCallId?: number;
}

/** Pushes that can change a schedule's calls and alerts. */
const DETAIL_REFRESH_EVENTS = ['recurringCallAlertsUpdated', 'callsUpdated', 'callAdded', 'callClosed', 'eventingHubJoined'] as const;

const STATUS_TONES = { active: 'success', paused: 'warning', ended: 'muted' } as const satisfies Record<string, PillTone>;

const parseScheduleId = (value: string | string[] | undefined): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;

  return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
};

/** A titled block of the detail. */
const Section: React.FC<{ title: string; children: React.ReactNode; testID?: string }> = ({ title, children, testID }) => (
  <View style={styles.card} className="bg-background-0" testID={testID}>
    <Text className="mb-1 font-bold text-typography-900" accessibilityRole="header">
      {title}
    </Text>
    {children}
  </View>
);

/** A label and its value; nothing when the value is blank. */
const Row: React.FC<{ label: string; value: string | null | undefined; testID?: string }> = ({ label, value, testID }) =>
  value && value.trim() ? (
    <View className="mt-1" testID={testID}>
      <Text size="xs" className="text-typography-500">
        {label}
      </Text>
      <Text size="sm" className="text-typography-800">
        {value}
      </Text>
    </View>
  ) : null;

/**
 * One recurring call schedule (Dispatch): the schedule in plain words, how its calls are made, the call each occurrence
 * creates, its contact, pickup facility and destination, who it dispatches and alerts, when it is paused and why, its
 * next dispatches and the calls it created that have not gone out (a held one can be sent from here). Its creator or a
 * department admin who can create calls edits, pauses (with a reason, a resume date and whether its waiting calls go),
 * resumes or deletes it.
 */
export default function RecurringCallDetailScreen({ recurringCallId: idProp }: RecurringCallDetailScreenProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const colors = useThemeColors();
  const timeZone = useDepartmentTimeZone();
  const isEnabled = useIsRecurringCallsEnabled();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const recurringCallId = idProp ?? parseScheduleId(params.id);
  const key = recurringCallId ? String(recurringCallId) : '';
  const detail = useRecurringCallsStore((state) => (key ? state.details[key] : undefined));
  const detailError = useRecurringCallsStore((state) => (key ? state.detailErrors[key] : undefined));
  const busyKeys = useRecurringCallsStore((state) => state.busyKeys);
  const canCreate = useRecurringCallsStore((state) => state.options?.CanCreate === true);
  const today = useRecurringCallsStore((state) => state.options?.Today ?? null);
  const priorities = useCallsStore((state) => state.callPriorities);
  const { recipients } = useDispatchRecipients(isEnabled && !!detail);
  const [modal, setModal] = useState<null | 'pause' | 'delete'>(null);
  const [deleteUpcoming, setDeleteUpcoming] = useState(true);
  const locale = i18n?.language ?? 'en';

  const refresh = useCallback(async () => {
    if (recurringCallId) await useRecurringCallsStore.getState().fetchRecurringCall(recurringCallId, { bypassCache: true });
  }, [recurringCallId]);

  // A held call that was sent leaves the schedule's waiting calls: read the schedule again (no push may reach this desk).
  const dispatchNow = useCallDispatchNow({ onDispatched: () => void refresh() });

  useEffect(() => {
    if (!isEnabled || !recurringCallId) return;
    void refresh();
    void useRecurringCallsStore.getState().fetchOptions();
    void useCallsStore.getState().fetchCallPriorities();
  }, [isEnabled, recurringCallId, refresh]);

  useRealtimeRefetch(DETAIL_REFRESH_EVENTS, refresh, isEnabled && !!recurringCallId);

  const back = () => router.back();
  const schedule = detail?.RecurringCall ?? null;
  const title = schedule ? scheduleName(schedule) : t('recurring_calls.detail_title');
  const header = <ScreenHeader title={title} onBack={back} />;

  // Off in this app or department: no request runs, so neither a cached schedule nor its actions are shown.
  if (!isEnabled) {
    return (
      <View style={styles.screen} testID="recurring-call-detail-screen">
        <ScreenHeader title={t('recurring_calls.detail_title')} onBack={back} />
        <ZeroState heading={t('recurring_calls.not_available')} icon={CalendarDays} testID="recurring-call-detail-disabled" />
      </View>
    );
  }

  if (!recurringCallId) {
    return (
      <View style={styles.screen} testID="recurring-call-detail-screen">
        {header}
        <ZeroState isError heading={t('recurring_calls.not_found')} testID="recurring-call-detail-invalid" />
      </View>
    );
  }

  if (!detail || !schedule) {
    return (
      <View style={styles.screen} testID="recurring-call-detail-screen">
        {header}
        {detailError ? (
          <ZeroState
            isError
            heading={detailError.code === 'not_found' ? t('recurring_calls.not_found') : t('common.errorOccurred')}
            description={t(detailError.messageKey)}
            onRetry={refresh}
            testID="recurring-call-detail-error"
          />
        ) : (
          <Loading text={t('recurring_calls.loading_detail')} />
        )}
      </View>
    );
  }

  const status = recurringCallStatus(schedule);
  const isBusy = busyKeys.includes(recurringScheduleKey(schedule.RecurringCallId));
  const priority = resolvePriority(priorities, schedule.Priority);
  const protectedLabel = t('data_protection.protected_value');
  const formatInstant = (value: string | null | undefined): string => formatUtcInDepartmentTime(value, timeZone, { dateStyle: 'medium', timeStyle: 'short' }, locale);

  const dispatchTargets = targetNames(
    { users: schedule.DispatchUserIds.map(String), groups: schedule.DispatchGroupIds.map(String), roles: schedule.DispatchRoleIds.map(String), units: schedule.DispatchUnitIds.map(String) },
    recipients
  );

  const alertTargets = targetNames({ users: schedule.AlertUserIds.map(String), groups: schedule.AlertGroupIds.map(String), roles: schedule.AlertRoleIds.map(String) }, recipients);

  const report = (ok: boolean, message: string | null, successKey: string, errorKey: string): boolean => {
    if (ok) toast.success(message || t(successKey));
    else toast.error(message || t(errorKey));

    return ok;
  };

  const pause = async (values: PauseRecurringCallValues) => {
    const outcome = await useRecurringCallsStore.getState().pauseRecurringCall({
      RecurringCallId: schedule.RecurringCallId,
      Reason: values.reason || null,
      ResumeOn: values.resumeOn || null,
      DeleteUpcomingCalls: values.deleteUpcomingCalls,
    });

    if (report(outcome.ok, outcome.message, 'recurring_calls.pause_success', 'recurring_calls.pause_error')) setModal(null);
  };

  const resume = async () => {
    const outcome = await useRecurringCallsStore.getState().resumeRecurringCall(schedule.RecurringCallId);
    report(outcome.ok, outcome.message, 'recurring_calls.resume_success', 'recurring_calls.resume_error');
  };

  const remove = async () => {
    const outcome = await useRecurringCallsStore.getState().deleteRecurringCall(schedule.RecurringCallId, deleteUpcoming);

    if (report(outcome.ok, outcome.message, 'recurring_calls.delete_success', 'recurring_calls.delete_error')) {
      setModal(null);
      router.back();
    }
  };

  // The row opens the call; "Send call" sits beside it, not inside it, so screen readers reach it as its own button.
  const renderUpcoming = (call: RecurringCallUpcomingCallData) => (
    <View key={call.CallId} className="mt-2 flex-row items-center border-t border-outline-100 pt-2">
      <Pressable
        onPress={() => pushRoutePath(router, callRoutes.callDetail(String(call.CallId)))}
        accessibilityRole="button"
        accessibilityLabel={joinParts([call.Number, callDisplayName(call, protectedLabel)])}
        className="flex-1 flex-row items-center"
        testID={`recurring-call-upcoming-${call.CallId}`}
      >
        <View className="flex-1">
          <Text size="sm" className="font-semibold text-typography-900" numberOfLines={1}>
            {joinParts([call.Number ? `#${call.Number}` : null, callDisplayName(call, protectedLabel)])}
          </Text>
          <Text size="xs" className="text-typography-500">
            {call.IsHeld ? t('recurring_calls.upcoming_held') : t('recurring_calls.upcoming_dispatch_on', { time: formatInstant(call.DispatchOn) })}
          </Text>
        </View>
        {call.IsHeld && canCreate ? null : (
          <View>
            <ChevronRight size={16} color={colors.textSubtle} />
          </View>
        )}
      </Pressable>
      {call.IsHeld && canCreate ? (
        <ActionButton
          label={t('recurring_calls.alerts.send_held')}
          icon={Send}
          isBusy={dispatchNow.busyCallId === String(call.CallId)}
          onPress={() => void dispatchNow.openDispatchPicker(String(call.CallId))}
          testID={`recurring-call-upcoming-${call.CallId}-send`}
        />
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen} className="bg-background-50" testID="recurring-call-detail-screen">
      {header}
      <KeyboardAwareScrollView contentContainerStyle={styles.content} testID="recurring-call-detail-scroll">
        <View style={styles.card} className="bg-background-0" testID="recurring-call-summary">
          <Text className="text-lg font-bold text-typography-900" accessibilityRole="header">
            {title}
          </Text>
          <View className="mt-1 flex-row flex-wrap">
            <StatusPill label={t(STATUS_LABEL_KEYS[status])} tone={STATUS_TONES[status]} testID="recurring-call-status" />
            <StatusPill label={t(modeLabelKey(schedule))} tone="info" />
            {schedule.UseRunCard ? <StatusPill label={t('recurring_calls.run_card')} tone="muted" /> : null}
          </View>
          <Text className="mt-1 text-typography-800" testID="recurring-call-pattern">
            {describeSchedule(schedule, t, locale)}
          </Text>
          <Text size="sm" className="mt-1 text-typography-600" testID="recurring-call-mode">
            {describeMode(schedule, t)}
          </Text>
          {schedule.UseRunCard ? (
            <Text size="sm" className="mt-1 text-typography-600">
              {t('recurring_calls.run_card_summary')}
            </Text>
          ) : null}
          {schedule.Description ? <Text className="mt-2 text-typography-700">{schedule.Description}</Text> : null}
          {schedule.NextDispatchOn ? (
            <Text size="sm" className="mt-2 font-semibold text-typography-800" testID="recurring-call-next">
              {t('recurring_calls.next_dispatch', { time: formatInstant(schedule.NextDispatchOn) })}
            </Text>
          ) : null}
          {schedule.CanManage ? (
            <View className="mt-3 flex-row flex-wrap justify-end">
              <ActionButton label={t('recurring_calls.edit')} icon={Pencil} tone="secondary" onPress={() => pushRoutePath(router, recurringCallsRoutes.edit(schedule.RecurringCallId))} testID="recurring-call-edit" />
              {status === 'active' ? <ActionButton label={t('recurring_calls.pause')} icon={Pause} tone="secondary" isBusy={isBusy} onPress={() => setModal('pause')} testID="recurring-call-pause" /> : null}
              {status === 'paused' ? <ActionButton label={t('recurring_calls.resume')} icon={Play} isBusy={isBusy} onPress={() => void resume()} testID="recurring-call-resume" /> : null}
              <ActionButton label={t('recurring_calls.delete')} icon={Trash2} tone="negative" isBusy={isBusy} onPress={() => setModal('delete')} testID="recurring-call-delete" />
            </View>
          ) : null}
        </View>

        {status === 'paused' ? (
          <View style={styles.card} className="border border-warning-300 bg-warning-50" testID="recurring-call-paused">
            <Text className="font-bold text-warning-800">{t('recurring_calls.paused_title')}</Text>
            <Text size="sm" className="text-typography-700">
              {joinParts([schedule.PausedByName ? t('recurring_calls.paused_by', { name: schedule.PausedByName }) : null, schedule.PausedOn ? formatInstant(schedule.PausedOn) : null])}
            </Text>
            {schedule.PauseReason ? (
              <Text size="sm" className="text-typography-700">
                {t('recurring_calls.paused_reason', { reason: schedule.PauseReason })}
              </Text>
            ) : null}
            <Text size="sm" className="text-typography-700">
              {schedule.ResumeOn ? t('recurring_calls.resumes_on', { date: formatDateKey(schedule.ResumeOn, locale) }) : t('recurring_calls.stays_paused')}
            </Text>
          </View>
        ) : null}

        {schedule.OpenAlertCount > 0 ? (
          <Pressable onPress={() => pushRoutePath(router, recurringCallsRoutes.alerts())} accessibilityRole="link" testID="recurring-call-open-alerts">
            <View style={styles.card} className="flex-row items-center border border-warning-300 bg-warning-50">
              <View className="mr-2">
                <BellRing size={16} color={colors.warning} />
              </View>
              <Text className="flex-1 font-semibold text-warning-800">{t('recurring_calls.open_alerts', { count: schedule.OpenAlertCount })}</Text>
              <View>
                <ChevronRight size={16} color={colors.warning} />
              </View>
            </View>
          </Pressable>
        ) : null}

        <Section title={t('recurring_calls.section_upcoming')} testID="recurring-call-upcoming">
          {detail.NextDispatches.length > 0 ? (
            detail.NextDispatches.map((instant) => (
              <Text key={instant} size="sm" className="mt-1 text-typography-800">
                {formatInstant(instant)}
              </Text>
            ))
          ) : (
            <Text size="sm" className="text-typography-500">
              {t('recurring_calls.no_next_dispatch')}
            </Text>
          )}
          {detail.UpcomingCalls.map(renderUpcoming)}
          <View className="mt-2 flex-row justify-end">
            <ActionButton
              label={t('recurring_calls.calendar.title')}
              icon={CalendarDays}
              tone="secondary"
              onPress={() => pushRoutePath(router, recurringCallsRoutes.calendar(schedule.RecurringCallId))}
              testID="recurring-call-calendar"
            />
          </View>
        </Section>

        <Section title={t('recurring_calls.section_call')} testID="recurring-call-call">
          <Row label={t('recurring_calls.field_nature')} value={schedule.NatureOfCall} />
          <Row label={t('recurring_calls.field_address')} value={schedule.Address} />
          <Row label={t('recurring_calls.field_priority')} value={priority ? (priority.isLabelKey ? t(priority.label) : priority.label) : null} />
          <Row label={t('recurring_calls.field_type')} value={schedule.Type} />
          <Row label={t('recurring_calls.field_call_contact')} value={joinParts([schedule.ContactName, schedule.ContactNumber])} />
          {/* Core M0322: the free destination (no destination POI) and the route each call runs. */}
          <Row label={t('recurring_calls.field_destination_location')} value={joinParts([schedule.DestinationAddress, schedule.DestinationGeoLocationData])} testID="recurring-call-destination-location" />
          <Row label={t('recurring_calls.field_route')} value={schedule.RoutePlanName || (schedule.RoutePlanId ? t('calls.route_unknown') : null)} testID="recurring-call-route" />
          <Row label={t('recurring_calls.field_notes')} value={schedule.Notes} />
          <Row label={t('recurring_calls.field_reference')} value={joinParts([schedule.ReferenceNumber, schedule.IncidentNumber, schedule.ExternalIdentifier])} />
        </Section>

        <Section title={t('recurring_calls.section_details')} testID="recurring-call-metadata">
          <Row label={t('recurring_calls.field_schedule_contact')} value={joinParts([schedule.ScheduleContactName, schedule.ScheduleContactNumber, schedule.ScheduleContactEmail])} testID="recurring-call-contact" />
          <Row label={t('recurring_calls.field_facility')} value={joinParts([schedule.FacilityName, schedule.FacilityDetails])} testID="recurring-call-facility" />
          <Row label={t('recurring_calls.field_destination')} value={joinParts([schedule.DestinationName, schedule.DestinationDetails])} testID="recurring-call-destination" />
          <Row label={t('recurring_calls.created_by')} value={joinParts([schedule.CreatedByName, schedule.CreatedOn ? formatInstant(schedule.CreatedOn) : null])} />
        </Section>

        <Section title={t('recurring_calls.section_who')} testID="recurring-call-who">
          <Row
            label={t('recurring_calls.field_dispatch_targets')}
            value={summarizeNames(dispatchTargets, schedule.UseRunCard ? t('recurring_calls.targets_run_card_only') : t('recurring_calls.targets_none'))}
            testID="recurring-call-dispatch-targets"
          />
          <Row label={t('recurring_calls.field_alert_recipients')} value={summarizeNames(alertTargets, t('recurring_calls.alert_recipients_owner'))} testID="recurring-call-alert-recipients" />
        </Section>
      </KeyboardAwareScrollView>

      <PauseRecurringCallDialog isOpen={modal === 'pause'} isSubmitting={isBusy} today={today} onConfirm={(values) => void pause(values)} onClose={() => setModal(null)} />
      <CallConfirmDialog
        isOpen={modal === 'delete'}
        title={t('recurring_calls.delete_title')}
        message={t('recurring_calls.delete_confirm', { schedule: title })}
        confirmLabel={t('recurring_calls.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        isBusy={isBusy}
        onConfirm={() => void remove()}
        onCancel={() => setModal(null)}
        testID="recurring-call-delete-confirm"
      >
        <View style={styles.switchRow}>
          <Text className="flex-1 pr-3">{t('recurring_calls.delete_upcoming_calls')}</Text>
          <Switch value={deleteUpcoming} onValueChange={setDeleteUpcoming} accessibilityLabel={t('recurring_calls.delete_upcoming_calls')} testID="recurring-call-delete-upcoming" />
        </View>
      </CallConfirmDialog>
      {dispatchNow.dialogs}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 12, paddingBottom: 24 },
  card: { borderRadius: 12, padding: 12, marginBottom: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});
