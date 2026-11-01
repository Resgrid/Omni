import { parseUtcMs } from '@resgrid/core/utils/dates';
import {
  type CommandStructureNode,
  type IncidentCommandBoard,
  IncidentCommandStatus,
  type IncidentTimer,
  IncidentTimerStatus,
  ParStatus,
  type PersonnelCallCheckInStatus,
  type ResourceAssignment,
  ResourceAssignmentKind,
} from '@resgrid/models';

/**
 * Pure command-board rules (IC `app/(app)/command.tsx`, `structure-section`, `landscape-structure-board`,
 * `accountability-section`; Dispatch `command-board-view` lane ordering). No React, no stores.
 */

/** Rows created offline carry `local-<eventId>` ids until the server acknowledges them. */
export const isLocalId = (id: string | null | undefined): boolean => typeof id === 'string' && id.startsWith('local-');

export const isUnitKind = (kind: number): boolean => kind === ResourceAssignmentKind.RealUnit || kind === ResourceAssignmentKind.LinkedDeptUnit || kind === ResourceAssignmentKind.AdHocUnit;

export const isDepartmentUnitKind = (kind: number): boolean => kind === ResourceAssignmentKind.RealUnit || kind === ResourceAssignmentKind.LinkedDeptUnit;

export const isDepartmentPersonnelKind = (kind: number): boolean => kind === ResourceAssignmentKind.RealPersonnel || kind === ResourceAssignmentKind.LinkedDeptPersonnel;

export const isCommandClosed = (board: IncidentCommandBoard | null | undefined): boolean => board?.Command?.Status === IncidentCommandStatus.Closed;

export interface OrderedLane {
  node: CommandStructureNode;
  depth: number;
  /** Position among siblings (reorder buttons). */
  index: number;
  siblings: number;
}

/** Live lanes flattened by hierarchy (ParentNodeId, then SortOrder) with their depth — Dispatch ordering, IC sort. */
export function orderLanes(nodes: readonly CommandStructureNode[] | null | undefined): OrderedLane[] {
  const live = (nodes ?? []).filter((node) => !node.DeletedOn);
  const ids = new Set(live.map((node) => node.CommandStructureNodeId));
  const bySort = (a: CommandStructureNode, b: CommandStructureNode) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0) || a.Name.localeCompare(b.Name);
  const childrenOf = (parentId: string) => live.filter((node) => node.ParentNodeId === parentId).sort(bySort);
  const roots = live.filter((node) => !node.ParentNodeId || !ids.has(node.ParentNodeId)).sort(bySort);
  const rows: OrderedLane[] = [];
  const seen = new Set<string>();
  const walk = (list: CommandStructureNode[], depth: number) => {
    list.forEach((node, index) => {
      if (seen.has(node.CommandStructureNodeId)) return;
      seen.add(node.CommandStructureNodeId);
      rows.push({ node, depth, index, siblings: list.length });
      walk(childrenOf(node.CommandStructureNodeId), depth + 1);
    });
  };
  walk(roots, 0);
  return rows;
}

export const activeAssignments = (assignments: readonly ResourceAssignment[] | null | undefined): ResourceAssignment[] => (assignments ?? []).filter((assignment) => !assignment.ReleasedOn);

export const laneAssignments = (assignments: readonly ResourceAssignment[], nodeId: string): ResourceAssignment[] => assignments.filter((assignment) => assignment.CommandStructureNodeId === nodeId);

/** Tracked on the incident but in no lane (IC "unassigned pool": an assignment with an empty node id). */
export const poolAssignments = (assignments: readonly ResourceAssignment[]): ResourceAssignment[] => assignments.filter((assignment) => !assignment.CommandStructureNodeId);

export const laneUnitCount = (assignments: readonly ResourceAssignment[]): number => assignments.filter((assignment) => isUnitKind(assignment.ResourceKind)).length;

export interface LaneStaffing {
  units: number;
  /** Below the lane's MinUnits (advisory). */
  isUnderstaffed: boolean;
  /** At or above a non-zero MaxUnits. */
  isFull: boolean;
}

export function laneStaffing(node: CommandStructureNode, assignments: readonly ResourceAssignment[]): LaneStaffing {
  const units = laneUnitCount(assignments);
  return { units, isUnderstaffed: !!node.MinUnits && units < node.MinUnits, isFull: !!node.MaxUnits && units >= node.MaxUnits };
}

export const nextSortOrder = (nodes: readonly CommandStructureNode[] | null | undefined): number => (nodes ?? []).filter((node) => !node.DeletedOn).reduce((max, node) => Math.max(max, (node.SortOrder ?? 0) + 1), 0);

/** One PAR row per member: older servers emit a row per dispatch (IC `dedupeByUserId`). */
export function dedupeByUserId<T extends { UserId: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.UserId)) return false;
    seen.add(row.UserId);
    return true;
  });
}

export interface AccountabilityCounts {
  green: number;
  warning: number;
  critical: number;
  total: number;
}

export function accountabilityCounts(rows: readonly PersonnelCallCheckInStatus[] | null | undefined): AccountabilityCounts {
  const unique = dedupeByUserId(rows ?? []);
  return {
    green: unique.filter((row) => row.Status === ParStatus.Green).length,
    warning: unique.filter((row) => row.Status === ParStatus.Warning).length,
    critical: unique.filter((row) => row.Status === ParStatus.Critical).length,
    total: unique.length,
  };
}

/** Most urgent first: critical, warning, then green, then by name. */
export function sortAccountability(rows: readonly PersonnelCallCheckInStatus[]): PersonnelCallCheckInStatus[] {
  const rank = (status: string) => (status === ParStatus.Critical ? 0 : status === ParStatus.Warning ? 1 : status === ParStatus.Green ? 3 : 2);
  return dedupeByUserId(rows).sort((a, b) => rank(a.Status) - rank(b.Status) || (a.FullName ?? '').localeCompare(b.FullName ?? ''));
}

/** Work-time light defaults (IC Tablet-Command-style crew fatigue): amber from 20 min, red from 40; 0 disables a colour. */
export const DEFAULT_WORK_TIME_AMBER_MINUTES = 20;
export const DEFAULT_WORK_TIME_RED_MINUTES = 40;

export type WorkTimeLevel = 'green' | 'amber' | 'red' | 'rotation';

export const workTimeMinutes = (assignedOn: string | null | undefined, nowMs: number): number | null => {
  const assignedMs = parseUtcMs(assignedOn);
  return assignedMs === null ? null : Math.max(0, Math.floor((nowMs - assignedMs) / 60_000));
};

/** Lane thresholds: unset → defaults, 0 → that colour disabled; MaxTimeInRole exceeded → rotation due. */
export function workTimeLevel(minutes: number, node?: Pick<CommandStructureNode, 'WorkTimeAmberMinutes' | 'WorkTimeRedMinutes' | 'MaxTimeInRole'> | null): WorkTimeLevel {
  const amber = node?.WorkTimeAmberMinutes ?? DEFAULT_WORK_TIME_AMBER_MINUTES;
  const red = node?.WorkTimeRedMinutes ?? DEFAULT_WORK_TIME_RED_MINUTES;
  const rotation = node?.MaxTimeInRole ?? 0;
  if (rotation > 0 && minutes >= rotation) return 'rotation';
  if (red > 0 && minutes >= red) return 'red';
  if (amber > 0 && minutes >= amber) return 'amber';
  return 'green';
}

export const WORK_TIME_COLORS: Record<WorkTimeLevel, string> = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444', rotation: '#ef4444' };

/** What assigning a resource to a lane should do, given its current assignment (IC handleAssignResourceSave). */
export type AssignDecision =
  | { action: 'assign' }
  | { action: 'none' }
  /** In the pool: move without asking. */
  | { action: 'move'; assignmentId: string }
  /** In another lane: ask before moving. */
  | { action: 'confirm-move'; assignmentId: string; fromNodeId: string };

export function decideAssignment(assignments: readonly ResourceAssignment[], kind: number, resourceId: string, targetNodeId: string): AssignDecision {
  const existing = assignments.find((assignment) => !assignment.ReleasedOn && assignment.ResourceKind === kind && assignment.ResourceId === resourceId);
  if (!existing) return { action: 'assign' };
  if ((existing.CommandStructureNodeId || '') === targetNodeId) return { action: 'none' };
  if (!existing.CommandStructureNodeId) return { action: 'move', assignmentId: existing.ResourceAssignmentId };
  return { action: 'confirm-move', assignmentId: existing.ResourceAssignmentId, fromNodeId: existing.CommandStructureNodeId };
}

/** Seconds until a running timer is due (negative = overdue); null when it is not running or has no due time. */
export function timerDueInSeconds(timer: Pick<IncidentTimer, 'Status' | 'NextDueOn'>, nowMs: number): number | null {
  if (timer.Status !== IncidentTimerStatus.Running && timer.Status !== IncidentTimerStatus.Due) return null;
  const dueMs = parseUtcMs(timer.NextDueOn);
  return dueMs === null ? null : Math.round((dueMs - nowMs) / 1000);
}

/** `m:ss` (or `h:mm:ss`) for a signed number of seconds; overdue values keep a leading minus. */
export function formatCountdown(seconds: number): string {
  const sign = seconds < 0 ? '-' : '';
  const total = Math.abs(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value));
  return hours > 0 ? `${sign}${hours}:${pad(minutes)}:${pad(secs)}` : `${sign}${minutes}:${pad(secs)}`;
}

/** Elapsed scene time since the command was established (`h:mm`), or null. */
export function sceneElapsed(establishedOn: string | null | undefined, nowMs: number): string | null {
  const startMs = parseUtcMs(establishedOn);
  if (startMs === null) return null;
  const minutes = Math.max(0, Math.floor((nowMs - startMs) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}:${rest < 10 ? `0${rest}` : rest}`;
}

/** A finite WGS84 coordinate pair from server strings (`"0"`/`"0"` = unset). */
export function parseCoordinates(latitude: string | number | null | undefined, longitude: string | number | null | undefined): { latitude: number; longitude: number } | null {
  const lat = typeof latitude === 'number' ? latitude : parseFloat(latitude ?? '');
  const lon = typeof longitude === 'number' ? longitude : parseFloat(longitude ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (lat === 0 && lon === 0) return null;
  return { latitude: lat, longitude: lon };
}
