import { useCapability } from '@resgrid/config';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { getDataSessionScope, useResourceViewStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { IncidentAttachment, IncidentContactInfo, IncidentNeed, ResourceIncidentView, TacticalObjective } from '@resgrid/models';
import { useRealtimeRefetch } from '@resgrid/realtime';
import { Badge, BadgeText, Button, ButtonText, Heading, HStack, Loading, Pressable, Text, useToast, VStack } from '@resgrid/ui';
import { MailIcon, MessageCircle, MessagesSquare, PhoneIcon, Radio, ShieldCheck, Users } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { useIncidentChat } from '../hooks/use-incident-chat';
import { incidentRoleName, needCategoryName, needStatusAction, needStatusName, objectiveStatusAction, objectiveStatusName, objectiveTypeName, safeColor } from '../lib/labels';
import { IncidentChatSection } from './incident-chat-section';
import { PercentBar } from './percent-bar';
import { SectionCard, SectionEmpty } from './section-card';
import { sortByCreated } from './sort';

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const ContactCard: React.FC<{ label: string; contact: IncidentContactInfo; onMessage: (userId: string) => void; testID: string }> = ({ label, contact, onMessage, testID }) => {
  const { t } = useTranslation();
  const toast = useToast();
  // The URL holds a phone number or address (PII): nothing is logged, a failure only says it could not open.
  const open = useCallback((url: string) => void Linking.openURL(url).catch(() => toast.error(t('incident_command.link_failed'))), [t, toast]);
  return (
    <View style={styles.contact} testID={testID}>
      <Text className="text-xs text-typography-500">{label}</Text>
      <Text className="font-medium text-typography-900">{contact.Name}</Text>
      {contact.Phone ? (
        <Pressable onPress={() => open(`tel:${contact.Phone}`)} accessibilityRole="link" accessibilityLabel={t('incident_command.call_person', { name: contact.Name })} testID={`${testID}-phone`}>
          <HStack className="mt-1 items-center" space="xs">
            <View>
              <PhoneIcon size={14} color="#3b82f6" />
            </View>
            <Text className="text-sm text-primary-600">{contact.Phone}</Text>
          </HStack>
        </Pressable>
      ) : null}
      {contact.Email ? (
        <Pressable onPress={() => open(`mailto:${contact.Email}`)} accessibilityRole="link" accessibilityLabel={t('incident_command.email_person', { name: contact.Name })} testID={`${testID}-email`}>
          <HStack className="mt-1 items-center" space="xs">
            <View>
              <MailIcon size={14} color="#3b82f6" />
            </View>
            <Text className="text-sm text-primary-600">{contact.Email}</Text>
          </HStack>
        </Pressable>
      ) : null}
      {contact.UserId ? (
        <Pressable onPress={() => onMessage(contact.UserId as string)} accessibilityRole="button" accessibilityLabel={t('incident_command.message_person', { name: contact.Name })} testID={`${testID}-message`}>
          <HStack className="mt-1 items-center" space="xs">
            <View>
              <MessageCircle size={14} color="#3b82f6" />
            </View>
            <Text className="text-sm text-primary-600">{t('incident_command.send_message')}</Text>
          </HStack>
        </Pressable>
      ) : null}
    </View>
  );
};

const ObjectiveRow: React.FC<{ objective: TacticalObjective; testID: string }> = ({ objective, testID }) => {
  const { t } = useTranslation();
  return (
    <View className="rounded-lg bg-background-50 p-2" testID={testID}>
      <HStack className="items-center justify-between" space="sm">
        <Text className="min-w-0 flex-1 font-semibold text-typography-900">{objective.Name}</Text>
        <Badge action={objectiveStatusAction(objective.Status)} size="sm">
          <BadgeText>{objectiveStatusName(t, objective.Status)}</BadgeText>
        </Badge>
      </HStack>
      <Text className="text-xs text-typography-500">{objectiveTypeName(t, objective.ObjectiveType)}</Text>
      {objective.Description ? <Text className="mt-1 text-sm text-typography-600">{objective.Description}</Text> : null}
      <PercentBar percent={objective.ProgressPercent} />
    </View>
  );
};

const NeedRow: React.FC<{ need: IncidentNeed; testID: string }> = ({ need, testID }) => {
  const { t } = useTranslation();
  return (
    <View className="rounded-lg bg-background-50 p-2" testID={testID}>
      <HStack className="items-center justify-between" space="sm">
        <Text className="min-w-0 flex-1 font-semibold text-typography-900">{need.Name}</Text>
        <Badge action={needStatusAction(need.Status)} size="sm">
          <BadgeText>{needStatusName(t, need.Status)}</BadgeText>
        </Badge>
      </HStack>
      <Text className="text-xs text-typography-500">{needCategoryName(t, need.Category)}</Text>
      {need.Description ? <Text className="mt-1 text-sm text-typography-600">{need.Description}</Text> : null}
      {need.QuantityRequested > 0 ? (
        <Text className="mt-1 text-sm text-typography-600">{t('incident_command.need_quantity_progress', { fulfilled: need.QuantityFulfilled ?? 0, requested: need.QuantityRequested })}</Text>
      ) : null}
    </View>
  );
};

const AttachmentRow: React.FC<{ attachment: IncidentAttachment }> = ({ attachment }) => (
  <View className="rounded-lg bg-background-50 p-2" testID={`incident-attachment-${attachment.IncidentAttachmentId}`}>
    <HStack className="items-center justify-between" space="sm">
      <Text className="min-w-0 flex-1 font-medium text-typography-900">{attachment.FileName}</Text>
      <Text className="text-xs text-typography-500">{formatBytes(attachment.ContentLength)}</Text>
    </HStack>
    {attachment.Description ? <Text className="mt-1 text-sm text-typography-600">{attachment.Description}</Text> : null}
  </View>
);

export interface ResourceIncidentPanelProps {
  callId: string;
  /** The unit whose lane assignment to show (Unit app: its active unit); defaults to the session's unit for unit-subject apps. */
  unitId?: number | string | null;
}

/**
 * The view tier (Responder/Unit `incident-command-tab-panel`): the responding resource's own slice of the command — its
 * lane assignment with leads, lane objectives and linked need; the commander; important information and action plan;
 * the incident chat channels it may use; objectives, needs, notes and attachments. Read-only; refreshes on
 * `incidentCommandUpdated`. "No command" (`not_found`) is an empty state, not an error.
 */
export const ResourceIncidentPanel: React.FC<ResourceIncidentPanelProps> = ({ callId, unitId: unitIdProp }) => {
  const { t } = useTranslation();
  const statusSubject = useCapability('status').subject;
  const unitId = unitIdProp !== undefined ? unitIdProp : statusSubject === 'unit' ? (getDataSessionScope()?.unitId ?? null) : null;
  const hasView = useResourceViewStore((state) => callId in state.viewsByCall);
  const view: ResourceIncidentView | null = useResourceViewStore((state) => state.viewsByCall[callId] ?? null);
  const isLoading = useResourceViewStore((state) => state.loading.view === true);
  const error = useResourceViewStore((state) => state.errors.view ?? null);
  const fetchIncidentView = useResourceViewStore((state) => state.fetchIncidentView);
  const chat = useIncidentChat(null);

  const load = useCallback((bypassCache: boolean) => fetchIncidentView(callId, unitId, { bypassCache }), [callId, fetchIncidentView, unitId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useRealtimeRefetch(['incidentCommandUpdated', 'eventingHubJoined'], () => load(true));

  const notes = useMemo(() => sortByCreated((view?.Notes ?? []).filter((note) => !note.DeletedOn)), [view?.Notes]);
  const attachments = useMemo(() => (view?.Attachments ?? []).filter((attachment) => !attachment.DeletedOn), [view?.Attachments]);

  if (isLoading && !hasView) {
    return (
      <View style={styles.panel} testID="incident-view-loading">
        <Loading text={t('common.loading')} />
      </View>
    );
  }

  if (error && !view) {
    return (
      <View style={styles.panel} testID="incident-view-error">
        <Text className="text-center text-typography-600">{t('incident_command.error_loading')}</Text>
        <Button size="sm" variant="outline" className="mt-3 self-center" onPress={() => void load(true)} testID="incident-view-retry">
          <ButtonText>{t('common.retry')}</ButtonText>
        </Button>
      </View>
    );
  }

  if (!view) {
    return (
      <View style={styles.panel} testID="incident-view-empty">
        <Text className="text-center text-typography-500">{t('incident_command.no_command')}</Text>
      </View>
    );
  }

  const assignment = view.MyAssignment;
  const roles = view.Roles ?? [];
  const chatInfo = view.Chat;

  return (
    <View style={styles.panel} testID="incident-view-panel">
      {assignment ? (
        <SectionCard title={t('incident_command.my_assignment')} testID="incident-view-assignment">
          <HStack className="items-center" space="sm">
            <View style={StyleSheet.flatten([styles.swatch, { backgroundColor: safeColor(assignment.Color) }])} testID="incident-view-lane-color" />
            <Text className="font-semibold text-typography-900">{assignment.LaneName}</Text>
          </HStack>
          <Text className="mt-1 text-xs text-typography-500">{t('incident_command.assigned_since_time', { time: formatUtcInDepartmentTime(assignment.AssignedOn, null) })}</Text>
          {assignment.PrimaryLead ? (
            <ContactCard label={t('incident_command.primary_lead')} contact={assignment.PrimaryLead} onMessage={(userId) => void chat.messagePerson(userId)} testID="incident-view-primary-lead" />
          ) : null}
          {assignment.SecondaryLead ? (
            <ContactCard label={t('incident_command.secondary_lead')} contact={assignment.SecondaryLead} onMessage={(userId) => void chat.messagePerson(userId)} testID="incident-view-secondary-lead" />
          ) : null}
          {assignment.PrimaryObjective ? (
            <View style={styles.block}>
              <Text className="mb-1 text-xs text-typography-500">{t('incident_command.primary_objective')}</Text>
              <ObjectiveRow objective={assignment.PrimaryObjective} testID="incident-view-primary-objective" />
            </View>
          ) : null}
          {assignment.SecondaryObjective ? (
            <View style={styles.block}>
              <Text className="mb-1 text-xs text-typography-500">{t('incident_command.secondary_objective')}</Text>
              <ObjectiveRow objective={assignment.SecondaryObjective} testID="incident-view-secondary-objective" />
            </View>
          ) : null}
          {assignment.LinkedNeed ? (
            <View style={styles.block}>
              <Text className="mb-1 text-xs text-typography-500">{t('incident_command.linked_need')}</Text>
              <NeedRow need={assignment.LinkedNeed} testID="incident-view-linked-need" />
            </View>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard title={t('incident_command.incident_info')} testID="incident-view-info">
        {view.Commander ? <ContactCard label={t('incident_command.commander')} contact={view.Commander} onMessage={(userId) => void chat.messagePerson(userId)} testID="incident-view-commander" /> : null}
        <Text className="mt-2 text-xs text-typography-500">{t('incident_command.established')}</Text>
        <Text className="font-medium text-typography-900">{formatUtcInDepartmentTime(view.EstablishedOn, null)}</Text>
        {view.EstimatedEndOn ? (
          <>
            <Text className="mt-2 text-xs text-typography-500">{t('incident_command.estimated_end')}</Text>
            <Text className="font-medium text-typography-900">{formatUtcInDepartmentTime(view.EstimatedEndOn, null)}</Text>
          </>
        ) : null}
        {view.ImportantInformation ? (
          <View style={styles.important} className="rounded-lg border-l-4 border-warning-500 bg-warning-50" testID="incident-view-important">
            <Text className="text-xs font-semibold text-warning-700">{t('incident_command.important_information')}</Text>
            <Text className="mt-1 text-sm text-typography-900">{view.ImportantInformation}</Text>
          </View>
        ) : null}
        {view.IncidentActionPlan ? (
          <View style={styles.block} testID="incident-view-action-plan">
            <Text className="text-xs text-typography-500">{t('incident_command.action_plan')}</Text>
            <Text className="text-sm text-typography-900">{view.IncidentActionPlan}</Text>
          </View>
        ) : null}
      </SectionCard>

      {chat.isAvailable ? (
        <IncidentChatSection
          channels={[
            { key: 'incident', label: t('incident_command.incident_channel'), icon: MessagesSquare, channelId: chatInfo?.IncidentChannelId },
            { key: 'lane', label: t('incident_command.lane_channel'), hint: assignment?.LaneName, icon: MessagesSquare, channelId: chatInfo?.LaneChannelId },
            { key: 'command', label: t('incident_command.command_channel'), hint: t('incident_command.command_channel_hint'), icon: ShieldCheck, channelId: chatInfo?.CommandChannelId },
            { key: 'leads', label: t('incident_command.leads_channel'), hint: t('incident_command.leads_channel_hint'), icon: Users, channelId: chatInfo?.LeadsChannelId },
            { key: 'dispatch', label: t('incident_command.dispatch_channel'), hint: t('incident_command.dispatch_channel_hint'), icon: Radio, channelId: chatInfo?.DispatchChannelId },
          ]}
          contacts={roles
            .filter((role) => !!role.Contact)
            .map((role) => ({ key: `${role.RoleType}-${role.Contact?.UserId ?? role.Contact?.Name ?? ''}`, label: incidentRoleName(t, role.RoleType), name: role.Contact?.Name ?? '', userId: role.Contact?.UserId }))}
          isFrozen={chatInfo?.IsFrozen === true}
          onOpenChannel={(channelId) => chat.openChannel(channelId)}
          onMessage={(userId) => void chat.messagePerson(userId)}
          testID="incident-view-chat"
        />
      ) : null}

      <SectionCard title={t('incident_command.objectives')} count={view.Objectives.length} testID="incident-view-objectives">
        {view.Objectives.length === 0 ? (
          <SectionEmpty text={t('incident_command.no_objectives')} />
        ) : (
          <VStack space="sm">
            {view.Objectives.map((objective) => (
              <ObjectiveRow key={objective.TacticalObjectiveId} objective={objective} testID={`incident-view-objective-${objective.TacticalObjectiveId}`} />
            ))}
          </VStack>
        )}
      </SectionCard>

      <SectionCard title={t('incident_command.needs')} count={view.Needs.length} testID="incident-view-needs">
        {view.Needs.length === 0 ? (
          <SectionEmpty text={t('incident_command.no_needs')} />
        ) : (
          <VStack space="sm">
            {view.Needs.map((need) => (
              <NeedRow key={need.IncidentNeedId} need={need} testID={`incident-view-need-${need.IncidentNeedId}`} />
            ))}
          </VStack>
        )}
      </SectionCard>

      <SectionCard title={t('incident_command.notes')} count={notes.length} testID="incident-view-notes">
        {notes.length === 0 ? (
          <SectionEmpty text={t('incident_command.no_notes')} />
        ) : (
          <VStack space="sm">
            {notes.map((note) => (
              <View key={note.IncidentNoteId} className="rounded-lg bg-background-50 p-2" testID={`incident-view-note-${note.IncidentNoteId}`}>
                {note.Title ? <Heading size="xs">{note.Title}</Heading> : null}
                <Text className="text-sm text-typography-900">{note.Body}</Text>
                <Text className="mt-1 text-xs text-typography-500">{formatUtcInDepartmentTime(note.CreatedOn, null)}</Text>
              </View>
            ))}
          </VStack>
        )}
      </SectionCard>

      <SectionCard title={t('incident_command.attachments')} count={attachments.length} testID="incident-view-attachments">
        {attachments.length === 0 ? (
          <SectionEmpty text={t('incident_command.no_attachments')} />
        ) : (
          <VStack space="sm">
            {attachments.map((attachment) => (
              <AttachmentRow key={attachment.IncidentAttachmentId} attachment={attachment} />
            ))}
          </VStack>
        )}
      </SectionCard>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 12 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  contact: { paddingVertical: 4 },
  block: { marginTop: 8 },
  important: { marginTop: 8, padding: 10 },
});
