import { useTranslation } from '@resgrid/i18n';
import type { CommandStructureNode, ResourceAssignment } from '@resgrid/models';
import { Badge, BadgeText, HStack, Pressable, ScrollView, Text, TypeIcon, useEdgeScroll, useThemeColors, VStack } from '@resgrid/ui';
import { ChevronLeft, ChevronRight, CloudOff, Eye, MessagesSquare, Network, Pencil, Plus, UserPlus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import type { BoardRoster } from '../hooks/use-board-roster';
import { isLocalId, laneAssignments, laneStaffing, type OrderedLane, poolAssignments } from '../lib/board';
import { LANE_GAP, LANE_GUTTER, LANE_MIN_HEIGHT, LANE_MIN_WIDTH, LANE_RESOURCE_GAP, laneColumnLayout, laneResourceColumns, laneScrollTarget } from '../lib/board-layout';
import { nodeTypeName, safeColor } from '../lib/labels';
import { BoardButton, IconPress } from './board-buttons';
import { SectionCard, SectionEmpty } from './section-card';
import { WorkTimeLight } from './work-time-light';

export interface StructureBoardProps {
  lanes: OrderedLane[];
  assignments: ResourceAssignment[];
  roster: Pick<BoardRoster, 'resourceName' | 'resourceIcon' | 'leadName'>;
  nowMs: number;
  /** Lanes as side-by-side columns filling the width (tablet, laptop, desktop) instead of a stacked list (phone). */
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
    <HStack
      space="sm"
      className={`items-center rounded-md border px-2 py-1.5 ${isSelected ? 'border-primary-500 bg-primary-50' : assignment.RequirementsWarning ? 'border-warning-500 bg-background-50' : 'border-transparent bg-background-50'}`}
    >
      <Pressable
        onPress={() => (canMove ? onSelect(id) : onView(assignment))}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityHint={canMove ? t('incident_command.move_hint') : undefined}
        className="min-w-0 flex-1 gap-1"
        testID={`lane-resource-${id}`}
      >
        <HStack className="min-w-0 items-center" space="sm">
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
      </Pressable>
      <IconPress label={t('incident_command.view_resource', { name })} icon={Eye} onPress={() => onView(assignment)} testID={`lane-resource-view-${id}`} />
    </HStack>
  );
});

ResourceRow.displayName = 'ResourceRow';

interface LaneDropTargetProps {
  label: string;
  onPress: () => void;
  testID: string;
}

/**
 * Laid over a lane the selected resource can move to, so a tap anywhere in it — the title, a resource, the empty space
 * a column stretches to — moves the resource there. Only while a move is in progress; the lane's own buttons and
 * resources are back once it ends.
 */
const LaneDropTarget: React.FC<LaneDropTargetProps> = ({ label, onPress, testID }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={StyleSheet.absoluteFill} className="rounded-lg data-[active=true]:bg-primary-100/50" testID={testID} />
);

interface LaneScrollStripProps {
  direction: -1 | 1;
  /** Lanes lie past this edge. */
  isEnabled: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}

/**
 * A full-height strip beside the lanes when they run past the edge: always there while they overflow (so the lanes
 * never change width mid-scroll), dimmed on the side that has nothing more, and a tap pages the lanes that way.
 */
const LaneScrollStrip: React.FC<LaneScrollStripProps> = ({ direction, isEnabled, label, onPress, testID }) => {
  const colors = useThemeColors();
  const Icon = direction === -1 ? ChevronLeft : ChevronRight;

  return (
    <Pressable
      onPress={onPress}
      disabled={!isEnabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !isEnabled }}
      style={StyleSheet.flatten([styles.strip, direction === -1 ? styles.stripLeft : styles.stripRight, isEnabled ? null : styles.stripIdle])}
      className="rounded-lg border border-outline-200 bg-background-50"
      testID={testID}
    >
      <View>
        <Icon size={20} color={colors.icon} />
      </View>
    </Pressable>
  );
};

/**
 * The ICS structure: lanes (Division/Group/Branch/…) with their resources plus the unassigned pool (IC
 * `structure-section` on phones, `landscape-structure-board` columns on tablets and desktop). Columns share the card's
 * whole width and are as tall as the fullest lane (no lane scrolls); a wide lane tiles its resources two or more across.
 * Lanes that do not fit at their minimum width scroll sideways, with the next lane cut off at the edge and a scroll strip
 * on each side. Moving is tap-to-select a resource, then tap anywhere in the target lane — the same gesture on touch,
 * mouse and keyboard.
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
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [columnsWidth, setColumnsWidth] = useState(0);
  const edge = useEdgeScroll();
  // A move in progress ends when the board turns read-only (the command closed, the rights changed): no lane stays a target.
  const selectedId = canAssignResources ? pickedId : null;
  const selected = useMemo(() => assignments.find((assignment) => assignment.ResourceAssignmentId === selectedId) ?? null, [assignments, selectedId]);

  useEffect(() => {
    if (!canAssignResources) setPickedId(null);
  }, [canAssignResources]);
  const pool = useMemo(() => poolAssignments(assignments), [assignments]);
  // The pool is a column too. Until the row is measured, lanes take their minimum width.
  const layout = useMemo(() => (columnsWidth > 0 ? laneColumnLayout(columnsWidth, lanes.length + 1) : { laneWidth: LANE_MIN_WIDTH, overflows: false, viewportWidth: 0 }), [columnsWidth, lanes.length]);
  const resourceColumns = columns ? laneResourceColumns(layout.laneWidth) : 1;

  const measureColumns = useCallback((event: LayoutChangeEvent) => setColumnsWidth(Math.round(event.nativeEvent.layout.width)), []);

  const pageLanes = (direction: -1 | 1) => edge.scrollViewRef.current?.scrollTo({ x: laneScrollTarget(edge.metricsRef.current, layout.laneWidth, direction), animated: true });

  const toggleSelect = useCallback((assignmentId: string) => setPickedId((current) => (current === assignmentId ? null : assignmentId)), []);

  const dropOn = useCallback(
    (targetNodeId: string) => {
      if (!selected) return;
      setPickedId(null);

      if ((selected.CommandStructureNodeId || '') !== targetNodeId) onMoveResource(selected, targetNodeId);
    },
    [onMoveResource, selected]
  );

  const moveLabel = (lane: string) => (selected ? t('incident_command.move_to_lane', { resource: roster.resourceName(selected.ResourceKind, selected.ResourceId), lane }) : lane);

  const columnStyle = (index: number) => ({ width: layout.laneWidth, minHeight: LANE_MIN_HEIGHT, marginLeft: index === 0 ? 0 : LANE_GAP });

  const renderResources = (rows: ResourceAssignment[], node?: CommandStructureNode) => {
    const renderRow = (assignment: ResourceAssignment) => (
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
    );

    if (resourceColumns === 1) return <VStack space="xs">{rows.map(renderRow)}</VStack>;

    const cell = { width: `${100 / resourceColumns}%` as const, paddingHorizontal: LANE_RESOURCE_GAP / 2, marginBottom: 4 };

    return (
      <View style={styles.resourceGrid}>
        {rows.map((assignment) => (
          <View key={assignment.ResourceAssignmentId} style={cell}>
            {renderRow(assignment)}
          </View>
        ))}
      </View>
    );
  };

  const renderLane = ({ node, depth }: OrderedLane, index: number) => {
    const rows = laneAssignments(assignments, node.CommandStructureNodeId);
    const staffing = laneStaffing(node, rows);
    const isTarget = !!selected && (selected.CommandStructureNodeId || '') !== node.CommandStructureNodeId;
    const leads = [roster.leadName(node.PrimaryLeadUserId, node.PrimaryLeadName), roster.leadName(node.SecondaryLeadUserId, node.SecondaryLeadName)].filter((name): name is string => !!name);
    const color = node.Color ? safeColor(node.Color) : null;

    return (
      <View
        key={node.CommandStructureNodeId}
        style={StyleSheet.flatten([
          styles.lane,
          columns ? columnStyle(index) : styles.laneStacked,
          !columns && depth > 0 ? { marginLeft: Math.min(depth, 4) * 12 } : null,
          color ? { borderLeftWidth: 4, borderLeftColor: color } : null,
        ])}
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
        <View style={styles.laneBody}>{rows.length === 0 ? <Text className="text-sm text-typography-500">{t('incident_command.lane_empty')}</Text> : renderResources(rows, node)}</View>
        {isTarget ? <LaneDropTarget label={moveLabel(node.Name)} onPress={() => dropOn(node.CommandStructureNodeId)} testID={`lane-target-${node.CommandStructureNodeId}`} /> : null}
      </View>
    );
  };

  const poolTarget = !!selected && !!selected.CommandStructureNodeId;

  const poolCard = (
    <View
      style={StyleSheet.flatten([styles.lane, columns ? columnStyle(0) : styles.laneStacked])}
      className={`rounded-lg border border-dashed ${poolTarget ? 'border-primary-400 bg-primary-50' : 'border-outline-300 bg-background-50'}`}
      testID="lane-pool"
    >
      <Text className="font-semibold text-typography-900">{t('incident_command.unassigned_pool')}</Text>
      <Text className="mb-2 text-xs text-typography-500">{t('incident_command.unassigned_pool_hint')}</Text>
      {pool.length === 0 ? <Text className="text-sm text-typography-500">{t('incident_command.pool_empty')}</Text> : renderResources(pool)}
      {poolTarget ? <LaneDropTarget label={moveLabel(t('incident_command.unassigned_pool'))} onPress={() => dropOn('')} testID="lane-target-pool" /> : null}
    </View>
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
          <BoardButton label={t('common.cancel')} variant="link" onPress={() => setPickedId(null)} testID="structure-move-cancel" />
        </HStack>
      ) : null}
      {lanes.length === 0 ? <SectionEmpty text={t('incident_command.no_lanes')} testID="structure-empty" /> : null}
      {columns ? (
        <View style={styles.columns} onLayout={measureColumns} testID="structure-columns">
          {layout.overflows ? <LaneScrollStrip direction={-1} isEnabled={edge.overflow.canScrollLeft} label={t('common.scroll_left')} onPress={() => pageLanes(-1)} testID="structure-scroll-left" /> : null}
          <ScrollView
            ref={edge.scrollViewRef}
            horizontal
            showsHorizontalScrollIndicator
            scrollEventThrottle={16}
            style={styles.columnsScroll}
            contentContainerStyle={styles.columnsContent}
            onLayout={edge.onLayout}
            onContentSizeChange={edge.onContentSizeChange}
            onScroll={edge.onScroll}
            testID="structure-columns-scroll"
          >
            <HStack className="items-stretch">
              {poolCard}
              {lanes.map((lane, index) => renderLane(lane, index + 1))}
            </HStack>
          </ScrollView>
          {layout.overflows ? <LaneScrollStrip direction={1} isEnabled={edge.overflow.canScrollRight} label={t('common.scroll_right')} onPress={() => pageLanes(1)} testID="structure-scroll-right" /> : null}
        </View>
      ) : (
        <VStack testID="structure-list">
          {lanes.map((lane, index) => renderLane(lane, index + 1))}
          {poolCard}
        </VStack>
      )}
    </SectionCard>
  );
};

const styles = StyleSheet.create({
  lane: { padding: 10 },
  laneStacked: { marginBottom: 8 },
  laneBody: { marginTop: 8 },
  // Strips and scroller side by side, the strips as tall as the lanes.
  columns: { flexDirection: 'row', alignItems: 'stretch' },
  columnsScroll: { flexGrow: 1, flexShrink: 1 },
  // Room under the lanes for the scroll bar (web, Electron) so it never covers the last resource.
  columnsContent: { paddingBottom: 4 },
  strip: { width: LANE_GUTTER - LANE_GAP, alignItems: 'center', paddingTop: 16 },
  stripLeft: { marginRight: LANE_GAP },
  stripRight: { marginLeft: LANE_GAP },
  stripIdle: { opacity: 0.35 },
  // Wide lanes: resource cards in rows, half the gap either side of each card.
  resourceGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -LANE_RESOURCE_GAP / 2 },
});
