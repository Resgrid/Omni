import { isFieldRedacted, ProtectedFieldIds } from '@resgrid/auth';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useCallsStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { HtmlRenderer, Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { callDisplayText, revealedCallText } from '../../lib/call-display';
import { resolvePriority } from '../../lib/call-priority';
import { isScheduledCall, scheduledDispatchUtc } from '../../lib/call-time';
import { DetailRow } from './detail-row';

export interface CallInfoPanelProps {
  call: CallResultData;
}

/**
 * Info tab (Dispatch): priority, alarm level once escalated, type, location, destination and its type, contact,
 * references, times (with the scheduled dispatch time while the call waits for it), the full nature and the call's note (HtmlRenderer).
 */
export const CallInfoPanel: React.FC<CallInfoPanelProps> = ({ call }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const priorities = useCallsStore((state) => state.callPriorities);
  const priority = resolvePriority(priorities, call.Priority);
  const redacted = (fieldId: string, value: string | null | undefined): boolean => isFieldRedacted(call.RedactedFields, fieldId, value);
  const destination = [call.DestinationName, call.DestinationAddress].filter((part) => !!part?.trim()).join(' — ');
  const coordinates = call.Latitude && call.Longitude ? `${call.Latitude}, ${call.Longitude}` : '';
  const noteProtected = redacted(ProtectedFieldIds.callNotes, call.Note);
  const protectedLabel = t('data_protection.protected_value');

  return (
    <View style={styles.panel} testID="call-info-panel">
      <DetailRow label={t('call_detail.priority')} value={priority ? (priority.isLabelKey ? t(priority.label) : priority.label) : t('common.unknown')} />
      {call.AlarmLevel > 1 ? <DetailRow label={t('run_cards.alarm_level_label')} value={String(call.AlarmLevel)} testID="call-info-alarm-level" /> : null}
      <DetailRow label={t('call_detail.type')} value={call.Type && call.Type !== 'No Type' ? call.Type : ''} />
      <DetailRow label={t('call_detail.address')} value={call.Address} isProtected={redacted(ProtectedFieldIds.callAddress, call.Address)} testID="call-info-address" />
      <DetailRow label={t('calls.coordinates')} value={coordinates} isProtected={redacted(ProtectedFieldIds.callGeolocation, call.Geolocation)} />
      <DetailRow label={t('calls.what3words')} value={call.What3Words} isProtected={redacted(ProtectedFieldIds.callWhat3Words, call.What3Words)} />
      <DetailRow label={t('call_detail.destination')} value={destination} />
      <DetailRow label={t('call_detail.destination_type')} value={call.DestinationTypeName} />
      <DetailRow label={t('call_detail.contact_name')} value={call.ContactName} isProtected={redacted(ProtectedFieldIds.callContactName, call.ContactName)} />
      <DetailRow label={t('call_detail.contact_info')} value={call.ContactInfo} isProtected={redacted(ProtectedFieldIds.callContactNumber, call.ContactInfo)} />
      <DetailRow label={t('calls.incident_id')} value={call.IncidentId} />
      <DetailRow label={t('call_detail.reference_id')} value={call.ReferenceId} />
      <DetailRow label={t('call_detail.external_id')} value={call.ExternalId} />
      <DetailRow label={t('call_detail.info.logged_on')} value={formatUtcInDepartmentTime(call.LoggedOnUtc, timeZone)} />
      {isScheduledCall(call, Date.now()) ? (
        <DetailRow label={t('call_detail.scheduled_on')} value={formatUtcInDepartmentTime(scheduledDispatchUtc(call), timeZone)} testID="call-info-scheduled-on" />
      ) : (
        <DetailRow label={t('call_detail.info.dispatched_on')} value={formatUtcInDepartmentTime(call.DispatchedOnUtc, timeZone)} />
      )}
      {/* The whole nature as text: the summary card shows it in a fixed-height box. */}
      <DetailRow label={t('call_detail.nature')} value={callDisplayText(call, 'Nature', protectedLabel)} isProtected={revealedCallText(call, 'Nature') === null} testID="call-info-nature" />
      {noteProtected ? (
        <DetailRow label={t('call_detail.note')} value={null} isProtected />
      ) : call.Note ? (
        <View style={styles.note}>
          <Text size="sm" className="mb-1 text-typography-500">
            {t('call_detail.note')}
          </Text>
          <HtmlRenderer html={call.Note} scrollEnabled showsVerticalScrollIndicator style={styles.html} testID="call-info-note-html" />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  note: { paddingVertical: 6 },
  html: { minHeight: 120 },
});
