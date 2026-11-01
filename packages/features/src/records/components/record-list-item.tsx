import { type PendingRecordDraft, useRecordsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type FieldRecordAssignmentData, type RecordSummaryData, RmsRecordState } from '@resgrid/models';
import { Badge, BadgeText, Pressable, Text } from '@resgrid/ui';
import { AlertTriangle, CloudOff, FileText } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useDefinitionDisplayName } from '../lib/definition-name';

type BadgeAction = 'muted' | 'info' | 'warning' | 'success' | 'error';

const stateAction = (state: number): BadgeAction => {
  switch (state) {
    case RmsRecordState.Draft:
      return 'muted';
    case RmsRecordState.ReadyForReview:
      return 'info';
    case RmsRecordState.Returned:
      return 'warning';
    case RmsRecordState.Finalized:
    case RmsRecordState.Amended:
      return 'success';
    default:
      return 'error';
  }
};

/** The state's own name from the server, else the enum name (never a raw number). */
export const recordStateName = (record: Pick<RecordSummaryData, 'State' | 'StateName'>): string => record.StateName ?? RmsRecordState[record.State] ?? '';

const RowShell: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string | null; badge: React.ReactNode; onPress: () => void; label: string; testID?: string }> = ({
  icon,
  title,
  subtitle,
  badge,
  onPress,
  label,
  testID,
}) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="px-4 py-3" testID={testID}>
    <View style={styles.row}>
      {icon}
      <View style={styles.body}>
        <Text className="font-medium text-typography-900" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text size="xs" className="text-typography-500" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge}
    </View>
  </Pressable>
);

export interface RecordListItemProps {
  record: RecordSummaryData;
  onPress: () => void;
  testID?: string;
}

/** One record row: number (or draft reference, or type), summary and state (IC list item, the most complete). */
export const RecordListItem: React.FC<RecordListItemProps> = ({ record, onPress, testID }) => {
  const { t } = useTranslation();
  // The record's own definition version names it; a version no longer in the catalog falls back to the key's current entry.
  const catalogName = useRecordsStore((state) => (record.DefinitionKey ? (state.entryFor(record.DefinitionKey, record.DefinitionVersion) ?? state.entryFor(record.DefinitionKey))?.Name : undefined));
  const typeName = useDefinitionDisplayName(record.DefinitionKey, catalogName);
  const title = record.RecordNumber || record.DraftReference || typeName || t('records.untitled');
  const state = recordStateName(record);
  return (
    <RowShell
      icon={
        <View className="mr-3 items-center justify-center rounded-full bg-primary-100" style={styles.avatar}>
          <FileText size={18} color="#2563eb" />
        </View>
      }
      title={title}
      subtitle={record.DisplaySummary || typeName}
      badge={
        <Badge action={stateAction(record.State)} size="sm">
          <BadgeText>{state}</BadgeText>
        </Badge>
      }
      label={state ? `${title}, ${state}` : title}
      onPress={onPress}
      testID={testID}
    />
  );
};

export interface PendingDraftItemProps {
  draft: PendingRecordDraft;
  onPress: () => void;
  testID?: string;
}

/** A draft staged on this device: not sent yet, queued, or refused (conflict / permission) and waiting for the person. */
export const PendingDraftItem: React.FC<PendingDraftItemProps> = ({ draft, onPress, testID }) => {
  const { t } = useTranslation();
  // A new draft is labelled by its type; one editing a saved record keeps that record's name.
  const typeName = useDefinitionDisplayName(draft.definitionKey, draft.name);
  const title = draft.recordId ? draft.name : typeName;
  const subtitle = draft.conflict ? t(`records.conflict_${draft.conflict.replace('-', '_')}`) : draft.lastError ? t('records.save_failed') : t('records.not_sent_yet');
  const attention = !!draft.conflict || !!draft.lastError;
  return (
    <RowShell
      icon={
        <View style={styles.avatar} className="mr-3 items-center justify-center rounded-full bg-background-100">
          {attention ? <AlertTriangle size={18} color="#d97706" /> : <CloudOff size={18} color="#64748b" />}
        </View>
      }
      title={title}
      subtitle={subtitle}
      badge={
        <Badge action={attention ? 'warning' : 'muted'} size="sm">
          <BadgeText>{attention ? t('records.needs_attention') : t('records.pending')}</BadgeText>
        </Badge>
      }
      label={`${title}, ${subtitle}`}
      onPress={onPress}
      testID={testID}
    />
  );
};

export interface AssignmentItemProps {
  assignment: FieldRecordAssignmentData;
  onPress: () => void;
  testID?: string;
}

/** An assignment the server routed to this person (acknowledge, complete, review…). */
export const AssignmentItem: React.FC<AssignmentItemProps> = ({ assignment, onPress, testID }) => {
  const { t } = useTranslation();
  const purpose = t(`records.purpose_${assignment.Purpose}`, { defaultValue: assignment.Purpose });
  const state = t(`records.assignment_state_${assignment.State.toLowerCase()}`, { defaultValue: assignment.State });
  return (
    <RowShell
      icon={null}
      title={purpose}
      subtitle={assignment.Note}
      badge={
        <Badge action={assignment.State === 'Acknowledged' ? 'info' : 'warning'} size="sm">
          <BadgeText>{state}</BadgeText>
        </Badge>
      }
      label={`${purpose}, ${state}`}
      onPress={onPress}
      testID={testID}
    />
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1, marginRight: 8 },
  avatar: { width: 40, height: 40 },
});
