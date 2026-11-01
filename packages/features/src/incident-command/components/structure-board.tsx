import { useTranslation } from '@resgrid/i18n';
import type { CommandStructureNode, ResourceAssignment } from '@resgrid/models';
import { Badge, BadgeText, HStack, Pressable, ScrollView, Text, TypeIcon, VStack } from '@resgrid/ui';
import { CloudOff, Eye, MessagesSquare, Network, Pencil, Plus, UserPlus } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { BoardRoster } from '../hooks/use-board-roster';
import { isLocalId, laneAssignments, laneStaffing, type OrderedLane, poolAssignments } from '../lib/board';
import { nodeTypeName, safeColor } from '../lib/labels';
import { BoardButton, IconPress } from './board-buttons';
import { SectionCard, SectionEmpty } from './section-card';
import { WorkTimeLight } from './work-time-light';

export interface StructureBoardProps {
  lanes: OrderedLane[];
  assignments: ResourceAssignment[];
  roster: Pick<BoardRoster, 'resourceName' | 'resourceIcon' | 'leadName'>;
  nowMs: number;
  /** Lanes as columns (tablet landscape, desktop) instead of a stacked list (phone). */
  columns: boolean;
  canManageStructure: boolean;
  canAssignResources: boolean;
  onAddLane: () => void;
  onEditLane: (node: CommandStructureNode) => void;
  onAssignToLane: (nodeId: string) => void;
  /** Tap-to-move: a selected resource dropped on another lane ('' = the unassigned pool). */
  onMoveResource: (assignment: ResourceAssignment, targetNodeId: string) => void;
  onViewResource: (assignment: ResourceAssignment) => void;
  /** Opens the lane's chat channel; omitted when the lane has none (or chat is off). */
  laneChatAvailable?: (nodeId: string) => boolean;
  onOpenLaneChat?: (nodeId: string) => void;
}

interface ResourceRowProps {
  assignment: ResourceAssignment;
  node?: CommandStructureNode;
  roster: StructureBoardProps['roster'];
  nowMs: number;
  isSelected: boolean;
  canMove: boolean;
  onSelect: (assignmentId: string) => void;
  onView: (assignment: ResourceAssignment) => void;
}

const ResourceRow: React.FC<ResourceRowProps> = React.memo(({ assignment, node, roster, nowMs, isSelected, canMove, onSelect, onView }) => {
  const { t } = useTranslation();
  const name = roster.resourceName(assignment.ResourceKind, assignment.ResourceId);
  const icon = roster.resourceIcon(assignment.ResourceKind, assignment.ResourceId);
  const id = assignment.ResourceAssignmentId;
  return (
    <Pressable
      onPress={() => (canMove ? onSelect(id) : onView(assignment))}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityHint={canMove ? t('incident_command.move_hint') : undefined}
      className={`rounded-md border px-2 py-1.5 ${isSelected ? 'border-primary-500 bg-primary-50' : assignment.RequirementsWarning ? 'border-warning-500 bg-background-50' : 'border-transparent bg-background-50'}`}
      testID={`lane-resource-${id}`}
    >
      <HStack className="items-center justify-between" space="sm">
        <HStack className="min-w-0 flex-1 items-center" space="sm">
          {icon ? <TypeIcon iconUrl={icon.iconUrl} mapIcon={icon.mapIcon} size={20} /> : null}
          <Text className="min-w-0 flex-1 text-sm text-typography-900" numberOfLines={1}>
            {name}
          </Text>
          {isLocalId(id) ? (
            <View accessibilityLabel={t('incident_command.pending_sync')} testID={`lane-resource-${id}-pending`}>
              <CloudOff size={14} color="#f59e0b" />
            </View>
          ) : null}
          {assignment.RequirementsWarning ? (
            <Badge action="warning" size="sm">
              <BadgeText>{t('incident_command.requirements_warning')}</BadgeText>
            </Badge>
          ) : null}
        </HStack>
        <WorkTimeLight assignedOn={assignment.AssignedOn} node={node} nowMs={nowMs} testID={`lane-worktime-${id}`} />
        <IconPress label={t('incident_command.view_resource', { name })} icon={Eye} onPress={() => onView(assignment)} testID={`lane-resource-view-${id}`} />
      </HStack>
    </Pressable>
  );
});
ResourceRow.displayName = 'ResourceRow';

/**
 * The ICS structure: lanes (Division/Group/Branch/…) with their resources plus the unassigned pool (IC
 * `structure-section` on phones, `landscape-structure-board` columns on tablets and desktop). Moving is tap-to-select a
 * resource, then tap the target lane — the same gesture on touch, mouse and keyboard.
 */
export const StructureBoard: React.FC<StructureBoardProps> = ({
  lanes,
  assignments,
  roster,
  nowMs,
  columns,
  canManageStructure,
  canAssignResources,
  onAddLane,
  onEditLane,
  onAssignToLane,
  onMoveResource,
  onViewResource,
  laneChatAvailable,
  onOpenLaneChat,
}) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => assignments.find((assignment) => assignment.ResourceAssignmentId === selectedId) ?? null, [assignments, selectedId]);
  const pool = useMemo(() => poolAssignments(assignments), [assignments]);

  const toggleSelect = useCallback((assignmentId: string) => setSelectedId((current) => (current === assignmentId ? null : assignmentId)), []);

  const dropOn = useCallback(
    (targetNodeId: string) => {
      if (!selected) return;
      setSelectedId(null);
      if ((selected.CommandStructureNodeId || '') !== targetNodeId) onMoveResource(selected, targetNodeId);
    },
    [onMoveResource, selected]
  );

  const renderLane = ({ node, depth }: OrderedLane) => {
    const rows = laneAssignments(assignments, node.CommandStructureNodeId);
    const staffing = laneStaffing(node, rows);
    const isTarget = !!selected && (selected.CommandStructureNodeId || '') !== node.CommandStructureNodeId;
    const leads = [roster.leadName(node.PrimaryLeadUserId, node.PrimaryLeadName), roster.leadName(node.SecondaryLeadUserId, node.SecondaryLeadName)].filter((name): name is string => !!name);
    const color = node.Color ? safeColor(node.Color) : null;
    return (
      <Pressable
        key={node.CommandStructureNodeId}
        onPress={() => dropOn(node.CommandStructureNodeId)}
        disabled={!isTarget}
        accessibilityHint={isTarget && selected ? t('incident_command.move_to_lane', { resource: roster.resourceName(selected.ResourceKind, selected.ResourceId), lane: node.Name }) : undefined}
        style={StyleSheet.flatten([styles.lane, columns ? styles.laneColumn : depth > 0 ? { marginLeft: Math.min(depth, 4) * 12 } : null, color ? { borderLeftWidth: 4, borderLeftColor: color } : null])}
        className={`rounded-lg border ${isTarget ? 'border-primary-400 bg-primary-50' : 'border-outline-200 bg-background-0'}`}
        testID={`lane-${node.CommandStructureNodeId}`}
      >
        <HStack className="items-start justify-between">
          <VStack className="min-w-0 flex-1">
            <HStack className="flex-wrap items-center" space="xs">
              <Text className="font-semibold text-typography-900" numberOfLines={1}>
                {node.Name}
              </Text>
              {isLocalId(node.CommandStructureNodeId) ? (
                <View accessibilityLabel={t('incident_command.pending_sync')} testID={`lane-${node.CommandStructureNodeId}-pending`}>
                  <CloudOff size={14} color="#f59e0b" />
                </View>
              ) : null}
              {staffing.isUnderstaffed ? (
                <Badge action="warning" size="sm" testID={`lane-understaffed-${node.CommandStructureNodeId}`}>
                  <BadgeText>{t('incident_command.lane_understaffed', { count: staffing.units, min: node.MinUnits ?? 0 })}</BadgeText>
                </Badge>
              ) : null}
            </HStack>
            <Text className="text-xs uppercase text-typography-500">
              {node.MaxUnits ? `${nodeTypeName(t, node.NodeType)} • ${t('incident_command.lane_capacity', { count: staffing.units, max: node.MaxUnits })}` : nodeTypeName(t, node.NodeType)}
            </Text>
            {leads.length > 0 ? (
              <Text className="text-xs text-typography-500" testID={`lane-leads-${node.CommandStructureNodeId}`}>
                {t('incident_command.lane_leads', { names: leads.join(', ') })}
              </Text>
            ) : null}
          </VStack>
          <HStack className="items-center">
            {onOpenLaneChat && laneChatAvailable?.(node.CommandStructureNodeId) ? (
              <IconPress
                label={t('incident_command.lane_chat', { lane: node.Name })}
                icon={MessagesSquare}
                onPress={() => onOpenLaneChat(node.CommandStructureNodeId)}
                testID={`lane-chat-${node.CommandStructureNodeId}`}
              />
            ) : null}
            {canManageStructure ? <IconPress label={t('incident_command.edit_lane', { lane: node.Name })} icon={Pencil} onPress={() => onEditLane(node)} testID={`lane-edit-${node.CommandStructureNodeId}`} /> : null}
            {canAssignResources ? (
              <IconPress
                label={t('incident_command.assign_to_lane', { lane: node.Name })}
                icon={UserPlus}
                color="#2563eb"
                onPress={() => onAssignToLane(node.CommandStructureNodeId)}
                testID={`lane-assign-${node.CommandStructureNodeId}`}
              />
            ) : null}
          </HStack>
        </HStack>
        <VStack space="xs" className="mt-2">
          {rows.length === 0 ? (
            <Text className="text-sm text-typography-500">{t('incident_command.lane_empty')}</Text>
          ) : (
            rows.map((assignment) => (
              <ResourceRow
                key={assignment.ResourceAssignmentId}
                assignment={assignment}
                node={node}
                roster={roster}
                nowMs={nowMs}
                isSelected={selectedId === assignment.ResourceAssignmentId}
                canMove={canAssignResources}
                onSelect={toggleSelect}
                onView={onViewResource}
              />
            ))
          )}
        </VStack>
      </Pressable>
    );
  };

  const poolTarget = !!selected && !!selected.CommandStructureNodeId;
  const poolCard = (
    <Pressable
      onPress={() => dropOn('')}
      disabled={!poolTarget}
      style={StyleSheet.flatten([styles.lane, columns ? styles.laneColumn : null])}
      className={`rounded-lg border border-dashed ${poolTarget ? 'border-primary-400 bg-primary-50' : 'border-outline-300 bg-background-50'}`}
      testID="lane-pool"
    >
      <Text className="font-semibold text-typography-900">{t('incident_command.unassigned_pool')}</Text>
      <Text className="mb-2 text-xs text-typography-500">{t('incident_command.unassigned_pool_hint')}</Text>
      <VStack space="xs">
        {pool.length === 0 ? (
          <Text className="text-sm text-typography-500">{t('incident_command.pool_empty')}</Text>
        ) : (
          pool.map((assignment) => (
            <ResourceRow
              key={assignment.ResourceAssignmentId}
              assignment={assignment}
              roster={roster}
              nowMs={nowMs}
              isSelected={selectedId === assignment.ResourceAssignmentId}
              canMove={canAssignResources}
              onSelect={toggleSelect}
              onView={onViewResource}
            />
          ))
        )}
      </VStack>
    </Pressable>
  );

  return (
    <SectionCard
      title={t('incident_command.structure')}
      icon={Network}
      count={lanes.length}
      action={canManageStructure ? <BoardButton label={t('incident_command.add_lane')} icon={Plus} onPress={onAddLane} testID="structure-add-lane" /> : undefined}
      testID="command-structure"
    >
      {selected ? (
        <HStack className="mb-2 items-center justify-between rounded-md bg-primary-50 px-2 py-1" testID="structure-move-banner">
          <Text className="flex-1 text-sm font-medium text-primary-700">{t('incident_command.move_selected', { resource: roster.resourceName(selected.ResourceKind, selected.ResourceId) })}</Text>
          <BoardButton label={t('common.cancel')} variant="link" onPress={() => setSelectedId(null)} testID="structure-move-cancel" />
        </HStack>
      ) : null}
      {lanes.length === 0 ? <SectionEmpty text={t('incident_command.no_lanes')} testID="structure-empty" /> : null}
      {columns ? (
        <ScrollView horizontal showsHorizontalScrollIndicator testID="structure-columns">
          <HStack className="items-start">
            {poolCard}
            {lanes.map(renderLane)}
          </HStack>
        </ScrollView>
      ) : (
        <VStack testID="structure-list">
          {lanes.map(renderLane)}
          {poolCard}
        </VStack>
      )}
    </SectionCard>
  );
};

const styles = StyleSheet.create({
  lane: { padding: 10, marginBottom: 8 },
  laneColumn: { width: 300, marginRight: 8 },
});
