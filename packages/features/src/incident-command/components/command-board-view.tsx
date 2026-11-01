import { useFeatureFlag, useSecurity } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { generateDataId, selectCallById, useCallsStore, useCommandStore, useCommandSupportStore, type WriteResult } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type CommandStructureNode, type IncidentNeed, type IncidentTimer, type ResourceAssignment, type TacticalObjective } from '@resgrid/models';
import { HStack, Text, useFormFactor, useToast } from '@resgrid/ui';
import { Radio, ShieldCheck, Users } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBoardRoster } from '../hooks/use-board-roster';
import { useCommandActions } from '../hooks/use-command-actions';
import { useCommandPermissions, useIncidentCommandTier } from '../hooks/use-command-permissions';
import { useIncidentChat } from '../hooks/use-incident-chat';
import { useIsOnline } from '../hooks/use-is-online';
import { useNow } from '../hooks/use-now';
import { activeAssignments, decideAssignment, isCommandClosed, laneAssignments, nextSortOrder, orderLanes } from '../lib/board';
import {
  acknowledgeTimerEvent,
  addLaneEvent,
  addNeedEvent,
  addNoteEvent,
  addObjectiveEvent,
  assignResourceEvent,
  assignRoleEvent,
  commandDetailsEvent,
  completeObjectiveEvent,
  createAdHocPersonnelEvent,
  createAdHocUnitEvent,
  deleteLaneEvent,
  moveResourceEvent,
  needStatusEvent,
  objectiveProgressEvent,
  releaseResourceEvent,
  removeRoleEvent,
  startTimerEvent,
  updateLaneEvent,
} from '../lib/events';
import { incidentRoleName } from '../lib/labels';
import type { IncidentCommandTier } from '../lib/permissions';
import { AccountabilitySection } from './accountability-section';
import { BoardButton } from './board-buttons';
import { CommandHeader } from './command-header';
import { IncidentChatSection } from './incident-chat-section';
import { LogSection } from './log-section';
import { NeedsSection } from './needs-section';
import { NotesSection } from './notes-section';
import { ObjectivesSection } from './objectives-section';
import { RolesSection } from './roles-section';
import { AdHocResourceSheet } from './sheets/ad-hoc-resource-sheet';
import { AssignResourceSheet } from './sheets/assign-resource-sheet';
import { AssistantSheet } from './sheets/assistant-sheet';
import { CommandDetailsSheet, NoteSheet, RoleSheet, TimerSheet, TransferCommandSheet } from './sheets/command-sheets';
import { type LaneDeleteDisposition, LaneSheet } from './sheets/lane-sheet';
import { type EndCommandCloseCall, EndCommandDialog } from './sheets/lifecycle-sheets';
import { AddNeedSheet, NeedStatusSheet } from './sheets/need-sheets';
import { AddObjectiveSheet, ObjectiveDetailsSheet } from './sheets/objective-sheets';
import { ResourceSheet } from './sheets/resource-sheet';
import { StructureBoard } from './structure-board';
import { TimersSection } from './timers-section';
import { VoiceSection } from './voice-section';

/** Core flag for the incident Q&A assistant (FeatureFlagKeys.AiAssistant); unknown = disabled. */
export const AI_ASSISTANT_FLAG = 'Ai.Assistant';

type Sheet = 'lane' | 'assign' | 'adhoc' | 'objective' | 'need' | 'timer' | 'note' | 'role' | 'transfer' | 'details' | 'end' | 'assistant' | null;

export interface CommandBoardViewProps {
  callId: string;
  /** Overrides the variant tier (tests, embedded panels). */
  tier?: IncidentCommandTier;
  /** Open the full incident log / command map / the call / the call's check-in tab; each is hidden when omitted. */
  onOpenLog?: () => void;
  onOpenMap?: () => void;
  onOpenCheckIns?: () => void;
  /** Show a resource on the map (department units with a known position). */
  onShowResourceOnMap?: (assignment: ResourceAssignment, name: string) => void;
  /** After the command was ended (the board is gone). */
  onEnded?: () => void;
  /** Extra header actions (e.g. "Open full board" in a call tab). */
  headerActions?: React.ReactNode;
}

/**
 * The command board for one incident — the same board in every app that shows one (IC command tier, Dispatch assist
 * tier), gated action by action by `useCommandPermissions`. Every write goes through the outbox (`useCommandActions`).
 * Layout follows the form factor: lanes as columns with side sections on tablets in landscape and desktop/Electron,
 * one stacked column on phones. Renders no vertical ScrollView (the hosting screen or call tab scrolls).
 */
export const CommandBoardView: React.FC<CommandBoardViewProps> = ({ callId, tier, onOpenLog, onOpenMap, onOpenCheckIns, onShowResourceOnMap, onEnded, headerActions }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { isLandscapeBoard, isDesktop, isPhone } = useFormFactor();
  const wide = isLandscapeBoard || isDesktop;
  const entry = useCommandStore((state) => state.boards[callId]);
  const refreshBoard = useCommandStore((state) => state.refreshBoard);
  const fetchTimeline = useCommandStore((state) => state.fetchTimeline);
  const endCommand = useCommandStore((state) => state.endCommand);
  const call = useCallsStore((state) => selectCallById(state, callId));
  const closeCapability = useCapability('calls').close;
  const board = entry?.board ?? null;
  const isClosed = isCommandClosed(board);
  const effectiveTier = useIncidentCommandTier(tier);
  const permissions = useCommandPermissions(callId, { tier, isClosed });
  const roster = useBoardRoster(entry);
  const chat = useIncidentChat(callId);
  const isOnline = useIsOnline();
  const assistantFlag = useFeatureFlag(AI_ASSISTANT_FLAG);
  const nowMs = useNow(60_000);
  const { run } = useCommandActions();
  const { canUserCreateCalls } = useSecurity();

  const [sheet, setSheet] = useState<Sheet>(null);
  const [editLane, setEditLane] = useState<CommandStructureNode | null>(null);
  const [assignTarget, setAssignTarget] = useState<string>('');
  const [viewResource, setViewResource] = useState<ResourceAssignment | null>(null);
  const [openObjective, setOpenObjective] = useState<TacticalObjective | null>(null);
  const [openNeed, setOpenNeed] = useState<IncidentNeed | null>(null);
  const [moveConflict, setMoveConflict] = useState<{ assignmentId: string; name: string; from: string; to: string; targetNodeId: string } | null>(null);

  const lanes = useMemo(() => orderLanes(board?.Nodes), [board?.Nodes]);
  const assignments = useMemo(() => activeAssignments(board?.Assignments), [board?.Assignments]);
  const laneName = useCallback(
    (nodeId: string | null | undefined) => (nodeId ? (lanes.find((lane) => lane.node.CommandStructureNodeId === nodeId)?.node.Name ?? t('incident_command.unassigned_pool')) : t('incident_command.unassigned_pool')),
    [lanes, t]
  );

  const close = useCallback(() => setSheet(null), []);
  const saved = t('incident_command.saved');

  const refresh = useCallback(() => {
    void refreshBoard(callId, { bypassCache: true });
    void fetchTimeline(callId);
  }, [callId, fetchTimeline, refreshBoard]);

  // ---------------------------------------------------------------- resources
  const assignTo = useCallback(
    async (kind: number, resourceId: string, targetNodeId: string) => {
      const decision = decideAssignment(board?.Assignments ?? [], kind, resourceId, targetNodeId);
      if (decision.action === 'none') return;
      if (decision.action === 'move') {
        await run(moveResourceEvent(callId, decision.assignmentId, targetNodeId));
        return;
      }
      if (decision.action === 'confirm-move') {
        setMoveConflict({ assignmentId: decision.assignmentId, name: roster.resourceName(kind, resourceId), from: laneName(decision.fromNodeId), to: laneName(targetNodeId), targetNodeId });
        return;
      }
      await run(assignResourceEvent(callId, targetNodeId, kind, resourceId));
    },
    [board?.Assignments, callId, laneName, roster, run]
  );

  const moveResource = useCallback((assignment: ResourceAssignment, targetNodeId: string) => void run(moveResourceEvent(callId, assignment.ResourceAssignmentId, targetNodeId)), [callId, run]);

  const deleteLane = useCallback(
    async (node: CommandStructureNode, disposition: LaneDeleteDisposition) => {
      setSheet(null);
      const rows = laneAssignments(assignments, node.CommandStructureNodeId);
      // Queued in order behind the moves/releases, so the server never deletes a lane that still holds resources.
      for (const row of rows) {
        await run(disposition === 'pool' ? moveResourceEvent(callId, row.ResourceAssignmentId, '') : releaseResourceEvent(callId, row.ResourceAssignmentId));
      }
      await run(deleteLaneEvent(callId, node.CommandStructureNodeId));
    },
    [assignments, callId, run]
  );

  // ---------------------------------------------------------------- lifecycle
  const reportWrite = useCallback(
    (result: WriteResult | null, messages: { sent: string; queued: string; rejected: string }) => {
      if (!result) return;
      if (result.outcome === 'sent') toast.success(messages.sent);
      else if (result.outcome === 'queued') toast.info(messages.queued);
      else toast.error(messages.rejected);
    },
    [toast]
  );

  const confirmEnd = useCallback(
    async (closeCall: EndCommandCloseCall | null) => {
      setSheet(null);
      try {
        const result = await endCommand(callId, closeCall ? { closeCall } : undefined);
        reportWrite(result.command, { sent: t('incident_command.end_command_success'), queued: t('incident_command.end_command_queued'), rejected: t('incident_command.end_command_failed') });
        if (closeCall && !result.call && result.command?.outcome === 'rejected') toast.warning(t('incident_command.close_call_skipped'));
        reportWrite(result.call, { sent: t('call_detail.close_call_success'), queued: t('incident_command.close_call_queued'), rejected: t('incident_command.close_call_failed') });
        if (result.call?.outcome === 'sent') void useCallsStore.getState().fetchCalls({ bypassCache: true });
        onEnded?.();
      } catch {
        toast.error(t('incident_command.write_failed'));
      }
    },
    [callId, endCommand, onEnded, reportWrite, t, toast]
  );

  if (!entry) return null;

  const command = board?.Command ?? null;
  const commanderName = command?.CurrentCommanderUserId ? roster.personName(command.CurrentCommanderUserId) : null;
  const title = call?.Number ? t('incident_command.call_number', { number: call.Number }) : t('incident_command.call_number', { number: callId });
  const subtitle = command?.Name || call?.Name || null;
  const roles = board?.Roles ?? [];
  const activeRoles = roles.filter((role) => !role.RemovedOn);

  const structure = (
    <StructureBoard
      lanes={lanes}
      assignments={assignments}
      roster={roster}
      nowMs={nowMs}
      columns={wide}
      canManageStructure={permissions.canManageStructure}
      canAssignResources={permissions.canAssignResources}
      onAddLane={() => {
        setEditLane(null);
        setSheet('lane');
      }}
      onEditLane={(node) => {
        setEditLane(node);
        setSheet('lane');
      }}
      onAssignToLane={(nodeId) => {
        setAssignTarget(nodeId);
        setSheet('assign');
      }}
      onMoveResource={moveResource}
      onViewResource={setViewResource}
      laneChatAvailable={chat.isAvailable ? (nodeId) => !!chat.laneChannelId(nodeId) : undefined}
      onOpenLaneChat={chat.isAvailable ? (nodeId) => chat.openChannel(chat.laneChannelId(nodeId)) : undefined}
    />
  );

  const resourceActions =
    permissions.canAssignResources || permissions.canManageResources ? (
      <View style={styles.resourceActions}>
        {permissions.canAssignResources ? (
          <BoardButton
            label={t('incident_command.add_to_incident')}
            icon={Users}
            onPress={() => {
              setAssignTarget('');
              setSheet('assign');
            }}
            testID="command-add-to-incident"
          />
        ) : null}
        {permissions.canManageResources ? (
          <View style={styles.actionGap}>
            <BoardButton label={t('incident_command.add_adhoc')} icon={ShieldCheck} onPress={() => setSheet('adhoc')} testID="command-add-adhoc" />
          </View>
        ) : null}
      </View>
    ) : null;

  const side = (
    <>
      <AccountabilitySection rows={board?.Accountability ?? []} personName={roster.personName} onOpenCheckIns={onOpenCheckIns} />
      <ObjectivesSection objectives={board?.Objectives ?? []} canManage={permissions.canManageObjectives} onAdd={() => setSheet('objective')} onOpen={setOpenObjective} />
      <NeedsSection needs={board?.Needs ?? []} canManage={permissions.canManageResources} onAdd={() => setSheet('need')} onOpen={setOpenNeed} />
      <TimersSection
        timers={board?.Timers ?? []}
        canManage={permissions.canManageTimers}
        onAdd={() => setSheet('timer')}
        onAcknowledge={(timer: IncidentTimer) => void run(acknowledgeTimerEvent(callId, timer.IncidentTimerId))}
      />
    </>
  );

  const rolesAndNotes = (
    <>
      <RolesSection
        roles={roles}
        personName={roster.personName}
        canManage={permissions.canManageRoles}
        onAdd={() => setSheet('role')}
        onRemove={(role) => void run(removeRoleEvent(callId, role.IncidentRoleAssignmentId))}
      />
      <NotesSection notes={board?.Notes ?? []} canAdd={permissions.canAddNotes} onAdd={() => setSheet('note')} authorName={roster.personName} />
    </>
  );

  const communications = (
    <>
      <LogSection entries={entry.timeline ?? []} onOpenFullLog={onOpenLog} />
      {chat.isAvailable ? (
        <IncidentChatSection
          channels={[
            { key: 'incident', label: t('incident_command.incident_channel'), icon: Users, channelId: chat.incidentChannelId },
            { key: 'command', label: t('incident_command.command_channel'), hint: t('incident_command.command_channel_hint'), icon: ShieldCheck, channelId: chat.commandChannelId },
            { key: 'leads', label: t('incident_command.leads_channel'), hint: t('incident_command.leads_channel_hint'), icon: Users, channelId: chat.leadsChannelId },
            { key: 'dispatch', label: t('incident_command.dispatch_channel'), hint: t('incident_command.dispatch_channel_hint'), icon: Radio, channelId: chat.dispatchChannelId },
          ]}
          contacts={[
            ...(command?.CurrentCommanderUserId ? [{ key: 'commander', label: t('incident_command.commander'), name: commanderName ?? '', userId: command.CurrentCommanderUserId }] : []),
            ...activeRoles.map((role) => ({ key: role.IncidentRoleAssignmentId, label: incidentRoleName(t, role.RoleType), name: roster.personName(role.UserId), userId: role.UserId })),
          ]}
          isFrozen={isClosed}
          onOpenChannel={(channelId) => chat.openChannel(channelId)}
          onMessage={(userId) => void chat.messagePerson(userId)}
        />
      ) : null}
      <VoiceSection callId={callId} canManage={permissions.canManageChannels} />
    </>
  );

  return (
    <View testID="command-board-view">
      <CommandHeader
        title={title}
        subtitle={subtitle}
        command={command}
        commanderName={commanderName}
        isProvisional={entry.isProvisional}
        isClosed={isClosed}
        isOnline={isOnline}
        roomy={!isPhone}
        onRefresh={refresh}
        onOpenLog={onOpenLog}
        onOpenMap={onOpenMap}
        onAssistant={effectiveTier === 'command' && assistantFlag && !isClosed ? () => setSheet('assistant') : undefined}
        onDetails={permissions.canManageCommand && board ? () => setSheet('details') : undefined}
        onTransfer={permissions.canManageCommand && board && !entry.isProvisional ? () => setSheet('transfer') : undefined}
        onEnd={permissions.canManageCommand ? () => setSheet('end') : undefined}
        extraActions={headerActions}
      />
      {moveConflict ? (
        <View style={styles.banner} className="rounded-lg bg-warning-50" testID="command-move-conflict">
          <Text className="text-sm text-typography-900">{t('incident_command.move_conflict', { resource: moveConflict.name, from: moveConflict.from, to: moveConflict.to })}</Text>
          <HStack className="mt-2 justify-end" space="sm">
            <BoardButton label={t('common.cancel')} onPress={() => setMoveConflict(null)} testID="command-move-conflict-cancel" />
            <BoardButton
              label={t('incident_command.move_resource')}
              variant="solid"
              onPress={() => {
                const conflict = moveConflict;
                setMoveConflict(null);
                void run(moveResourceEvent(callId, conflict.assignmentId, conflict.targetNodeId));
              }}
              testID="command-move-conflict-confirm"
            />
          </HStack>
        </View>
      ) : null}
      {resourceActions}
      {wide ? (
        <View style={styles.wideRow}>
          <View style={styles.wideMain}>{structure}</View>
          <View style={styles.wideSide}>{side}</View>
        </View>
      ) : (
        <>
          {structure}
          {side}
        </>
      )}
      {wide ? (
        <View style={styles.wideRow}>
          <View style={styles.wideHalf}>{rolesAndNotes}</View>
          <View style={styles.wideHalfLast}>{communications}</View>
        </View>
      ) : (
        <>
          {rolesAndNotes}
          {communications}
        </>
      )}

      <LaneSheet
        isOpen={sheet === 'lane'}
        onClose={close}
        node={editLane}
        parents={lanes.map((lane) => lane.node)}
        resourceCount={editLane ? laneAssignments(assignments, editLane.CommandStructureNodeId).length : 0}
        onSave={(input) => {
          setSheet(null);
          void run(
            editLane
              ? updateLaneEvent(callId, editLane, {
                  Name: input.name.trim(),
                  NodeType: input.nodeType,
                  Color: input.color ?? null,
                  MinUnits: input.minUnits ?? 0,
                  MaxUnits: input.maxUnits ?? 0,
                  MaxTimeInRole: input.maxTimeInRole ?? 0,
                  ParentNodeId: input.parentNodeId ?? null,
                })
              : addLaneEvent(callId, { ...input, sortOrder: nextSortOrder(board?.Nodes) }),
            { success: saved }
          );
        }}
        onDelete={editLane ? (disposition) => void deleteLane(editLane, disposition) : undefined}
      />
      <AssignResourceSheet
        isOpen={sheet === 'assign'}
        onClose={close}
        options={roster.options}
        targetNodeId={assignTarget}
        targetLabel={assignTarget ? t('incident_command.assign_to_lane_target', { lane: laneName(assignTarget) }) : t('incident_command.add_to_incident_target')}
        laneName={laneName}
        onSelect={(option) => {
          setSheet(null);
          void assignTo(option.kind, option.id, assignTarget);
        }}
      />
      <AdHocResourceSheet
        isOpen={sheet === 'adhoc'}
        onClose={close}
        onCreateUnit={(input) => {
          setSheet(null);
          void run(createAdHocUnitEvent(callId, input), { success: saved });
        }}
        onCreatePersonnel={(input) => {
          setSheet(null);
          void run(createAdHocPersonnelEvent(callId, input), { success: saved });
        }}
      />
      <ResourceSheet
        assignment={viewResource}
        onClose={() => setViewResource(null)}
        resourceName={viewResource ? roster.resourceName(viewResource.ResourceKind, viewResource.ResourceId) : ''}
        laneName={viewResource ? laneName(viewResource.CommandStructureNodeId) : ''}
        canAssign={permissions.canAssignResources}
        onMoveToPool={(assignment) => {
          setViewResource(null);
          void run(moveResourceEvent(callId, assignment.ResourceAssignmentId, ''));
        }}
        onRelease={(assignment) => {
          setViewResource(null);
          void run(releaseResourceEvent(callId, assignment.ResourceAssignmentId));
        }}
        onShowOnMap={
          onShowResourceOnMap
            ? (assignment) => {
                setViewResource(null);
                onShowResourceOnMap(assignment, roster.resourceName(assignment.ResourceKind, assignment.ResourceId));
              }
            : undefined
        }
      />
      <AddObjectiveSheet
        isOpen={sheet === 'objective'}
        onClose={close}
        onSave={(input) => {
          setSheet(null);
          void run(addObjectiveEvent(callId, input, (board?.Objectives ?? []).length), { success: saved });
        }}
      />
      <ObjectiveDetailsSheet
        objective={openObjective}
        onClose={() => setOpenObjective(null)}
        canManage={permissions.canManageObjectives}
        onProgress={(objective, percent) => {
          setOpenObjective(null);
          void run(objectiveProgressEvent(callId, objective.TacticalObjectiveId, percent));
        }}
        onComplete={(objective, outcome, note) => {
          setOpenObjective(null);
          void run(completeObjectiveEvent(callId, objective.TacticalObjectiveId, outcome, note), { success: saved });
        }}
      />
      <AddNeedSheet
        isOpen={sheet === 'need'}
        onClose={close}
        onSave={(input) => {
          setSheet(null);
          void run(addNeedEvent(callId, input, (board?.Needs ?? []).length), { success: saved });
        }}
      />
      <NeedStatusSheet
        need={openNeed}
        onClose={() => setOpenNeed(null)}
        onSave={(need, status, quantity, note) => {
          setOpenNeed(null);
          void run(needStatusEvent(callId, need.IncidentNeedId, status, quantity, note), { success: saved });
        }}
      />
      <TimerSheet
        isOpen={sheet === 'timer'}
        onClose={close}
        onStart={(name, seconds) => {
          setSheet(null);
          void run(startTimerEvent(callId, generateDataId(), name, seconds));
        }}
      />
      <NoteSheet
        isOpen={sheet === 'note'}
        onClose={close}
        onSave={(body, visibility, noteTitle) => {
          setSheet(null);
          void run(addNoteEvent(callId, body, visibility, noteTitle), { success: saved });
        }}
      />
      <RoleSheet
        isOpen={sheet === 'role'}
        onClose={close}
        people={roster.people}
        onAssign={(userId, roleType) => {
          setSheet(null);
          void run(assignRoleEvent(callId, userId, roleType), { success: saved });
        }}
      />
      <TransferCommandSheet
        isOpen={sheet === 'transfer'}
        onClose={close}
        people={roster.people}
        currentCommanderUserId={command?.CurrentCommanderUserId}
        onTransfer={(userId, notes) => {
          setSheet(null);
          // Online only: the outbox has no transfer event type yet (see the data support store).
          useCommandSupportStore
            .getState()
            .transferCommand(callId, userId, notes)
            .then(
              () => toast.success(t('incident_command.transfer_success')),
              () => toast.error(isOnline ? t('incident_command.transfer_failed') : t('incident_command.transfer_offline'))
            );
        }}
      />
      <CommandDetailsSheet
        isOpen={sheet === 'details'}
        onClose={close}
        estimatedEndOn={command?.EstimatedEndOn}
        importantInformation={command?.ImportantInformation}
        onSave={(input) => {
          setSheet(null);
          void run(commandDetailsEvent(callId, input), { success: saved });
        }}
      />
      <EndCommandDialog isOpen={sheet === 'end'} onClose={close} canCloseCall={closeCapability ? canUserCreateCalls : false} onConfirm={(closeCall) => void confirmEnd(closeCall)} />
      {assistantFlag ? <AssistantSheet isOpen={sheet === 'assistant'} onClose={close} callId={callId} isOnline={isOnline} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  resourceActions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  actionGap: { marginLeft: 8 },
  banner: { padding: 10, marginTop: 8 },
  wideRow: { flexDirection: 'row', alignItems: 'flex-start' },
  wideMain: { flex: 3, marginRight: 8 },
  wideSide: { flex: 2 },
  wideHalf: { flex: 1, marginRight: 8 },
  wideHalfLast: { flex: 1 },
});
