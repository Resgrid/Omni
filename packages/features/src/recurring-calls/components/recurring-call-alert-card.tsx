import { recurringAlertKey, type RecurringOccurrenceAction } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { RecurringCallAlertResultData, RecurringCallOccurrenceInput } from '@resgrid/models';
import { Pressable, Text, useThemeColors } from '@resgrid/ui';
import { BellRing, Check, ExternalLink, Repeat, Send, X } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { alertKindLabelKey, alertReasonLabelKey, alertTone, isHeldCall, unavailableNames } from '../lib/alert-format';
import { formatWallClock } from '../lib/schedule-format';
import { ActionButton } from './action-button';
import { OccurrenceButtons } from './occurrence-buttons';
import { type PillTone, StatusPill } from './status-pill';

const TONE_BORDERS: Record<PillTone, string> = {
  error: 'border-error-400',
  warning: 'border-warning-400',
  info: 'border-info-400',
  success: 'border-success-400',
  muted: 'border-outline-200',
};

/** Send, create and skip apply only while the occurrence has no call. */
const SEND_ACTIONS: readonly RecurringOccurrenceAction[] = ['dispatch', 'create', 'skip'];

export interface RecurringCallAlertCardProps {
  alert: RecurringCallAlertResultData;
  /** Raised since the dispatcher last looked: drawn highlighted. */
  isNew: boolean;
  /** An alert or occurrence action in flight (busy keys of the stores). */
  alertBusyKey: string | null;
  occurrenceBusyKey: string | null;
  onOccurrenceAction: (action: RecurringOccurrenceAction, occurrence: RecurringCallOccurrenceInput) => void;
  onAcknowledge: (alert: RecurringCallAlertResultData) => void;
  onDismiss: (alert: RecurringCallAlertResultData) => void;
  /** Opens the call's detail. */
  onOpenCall: (callId: number) => void;
  /** Sends a held (pending) call: the dispatch picker. */
  onDispatchHeld?: (callId: number) => void;
  onOpenSchedule?: (recurringCallId: number) => void;
}

/**
 * One open recurring call alert: what happened (kind and reason), the schedule, the occurrence in the department's time,
 * the call and the resources left off it, and what the dispatcher can do — send the occurrence now, create its call,
 * skip it, send a held call, open the call, acknowledge or dismiss. Actions need `CanAct` (call creation).
 */
export const RecurringCallAlertCard: React.FC<RecurringCallAlertCardProps> = ({
  alert,
  isNew,
  alertBusyKey,
  occurrenceBusyKey,
  onOccurrenceAction,
  onAcknowledge,
  onDismiss,
  onOpenCall,
  onDispatchHeld,
  onOpenSchedule,
}) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const locale = i18n?.language ?? 'en';
  const tone = alertTone(alert);
  const reasonKey = alertReasonLabelKey(alert);
  const names = unavailableNames(alert);
  const schedule = alert.ScheduleName?.trim() || `#${alert.RecurringCallId}`;
  const when = formatWallClock(alert.OccurrenceOnLocal, locale);
  const held = isHeldCall(alert);
  const busy = alertBusyKey === recurringAlertKey(alert.AlertId);
  const testID = `recurring-alert-${alert.AlertId}`;
  const occurrence: RecurringCallOccurrenceInput = { RecurringCallId: alert.RecurringCallId, OccurrenceOn: alert.OccurrenceOn };

  return (
    <View className={`mb-3 rounded-xl border-2 p-3 ${TONE_BORDERS[tone]} ${isNew ? 'bg-warning-50' : 'bg-background-0'}`} accessibilityLabel={`${t(alertKindLabelKey(alert))}, ${schedule}, ${when}`} testID={testID}>
      <View className="flex-row items-center">
        <View className="mr-2">
          <BellRing size={18} color={tone === 'info' ? colors.info : tone === 'warning' ? colors.warning : colors.error} />
        </View>
        <Text className="flex-1 font-bold text-typography-900" numberOfLines={2}>
          {t(alertKindLabelKey(alert))}
        </Text>
        {isNew ? <StatusPill label={t('recurring_calls.alerts.new')} tone="warning" testID={`${testID}-new`} /> : null}
      </View>
      <Pressable
        onPress={onOpenSchedule && !alert.ScheduleDeleted ? () => onOpenSchedule(alert.RecurringCallId) : undefined}
        disabled={!onOpenSchedule || alert.ScheduleDeleted}
        accessibilityRole={onOpenSchedule && !alert.ScheduleDeleted ? 'link' : undefined}
        className="mt-1 flex-row items-center"
        testID={`${testID}-schedule`}
      >
        <View className="mr-1">
          <Repeat size={14} color={colors.textMuted} />
        </View>
        <Text size="sm" className="font-semibold text-typography-800" numberOfLines={1}>
          {alert.ScheduleDeleted ? t('recurring_calls.alerts.schedule_deleted', { schedule }) : schedule}
        </Text>
      </Pressable>
      <Text size="sm" className="mt-1 text-typography-700" testID={`${testID}-when`}>
        {t('recurring_calls.alerts.occurrence_at', { time: when })}
      </Text>
      {alert.CallId ? (
        <Text size="sm" className="text-typography-700" testID={`${testID}-call`}>
          {held ? t('recurring_calls.alerts.call_held', { call: alert.CallNumber || alert.CallId }) : t('recurring_calls.alerts.call_number', { call: alert.CallNumber || alert.CallId })}
        </Text>
      ) : null}
      {reasonKey ? (
        <Text size="sm" className="text-typography-600" testID={`${testID}-reason`}>
          {t(reasonKey)}
        </Text>
      ) : null}
      {names ? (
        <Text size="sm" className="text-typography-600" testID={`${testID}-unavailable`}>
          {t('recurring_calls.alerts.unavailable', { names })}
        </Text>
      ) : null}
      {alert.AcknowledgedOn ? (
        <Text size="xs" className="mt-1 text-typography-500" testID={`${testID}-acknowledged`}>
          {alert.AcknowledgedByName ? t('recurring_calls.alerts.acknowledged_by', { name: alert.AcknowledgedByName }) : t('recurring_calls.alerts.acknowledged')}
        </Text>
      ) : null}
      {alert.CanAct && alert.CanSend ? (
        <OccurrenceButtons occurrence={occurrence} actions={SEND_ACTIONS} busyKey={occurrenceBusyKey} onAction={onOccurrenceAction} label={`${schedule} ${when}`} testID={`${testID}-occurrence`} />
      ) : null}
      <View className="mt-2 flex-row flex-wrap justify-end">
        {alert.CanAct && held && onDispatchHeld && alert.CallId ? (
          <ActionButton
            label={t('recurring_calls.alerts.send_held')}
            icon={Send}
            onPress={() => onDispatchHeld(alert.CallId ?? 0)}
            accessibilityLabel={`${t('recurring_calls.alerts.send_held')} ${schedule}`}
            testID={`${testID}-send-held`}
          />
        ) : null}
        {alert.CallId ? (
          <ActionButton
            label={t('recurring_calls.open_call')}
            icon={ExternalLink}
            tone="secondary"
            onPress={() => onOpenCall(alert.CallId ?? 0)}
            accessibilityLabel={`${t('recurring_calls.open_call')} ${alert.CallNumber ?? ''}`.trim()}
            testID={`${testID}-open-call`}
          />
        ) : null}
        {alert.CanAct && !alert.AcknowledgedOn ? (
          <ActionButton
            label={t('recurring_calls.alerts.acknowledge')}
            icon={Check}
            tone="secondary"
            isBusy={busy}
            onPress={() => onAcknowledge(alert)}
            accessibilityLabel={`${t('recurring_calls.alerts.acknowledge')} ${schedule}`}
            testID={`${testID}-acknowledge`}
          />
        ) : null}
        {alert.CanAct ? (
          <ActionButton
            label={t('recurring_calls.alerts.dismiss')}
            icon={X}
            tone="negative"
            isBusy={busy}
            onPress={() => onDismiss(alert)}
            accessibilityLabel={`${t('recurring_calls.alerts.dismiss')} ${schedule}`}
            testID={`${testID}-dismiss`}
          />
        ) : null}
      </View>
    </View>
  );
};
