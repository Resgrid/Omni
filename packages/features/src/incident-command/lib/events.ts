import { toApiUtcString } from '@resgrid/core/utils/dates';
import { IC_EVENT, type IcEventPayload, type IcEventType } from '@resgrid/data';
import {
  type CommandStructureNode,
  IncidentContentVisibility,
  IncidentNeedStatus,
  IncidentTimerScopeType,
  IncidentTimerStatus,
  IncidentTimerType,
  type ResourceAssignmentKind,
  TacticalObjectiveOutcome,
  TacticalObjectiveStatus,
} from '@resgrid/models';

/**
 * Outbox event builders for every board write (IC store actions → typed `IC_EVENT` payloads). Pure: the screens hand
 * the result to `useCommandStore().dispatchCommandEvent`, which orders writes per incident and replays them offline.
 * Creates carry `resolveCommandId` (the IncidentCommandId may not exist yet when the command was established offline)
 * and, for board collections, a `local` optimistic row that shows until the server acknowledges the write.
 */
export interface CommandEvent {
  type: IcEventType;
  payload: IcEventPayload;
}

const numericCallId = (callId: string): number => {
  const value = parseInt(callId, 10);
  return Number.isNaN(value) ? 0 : value;
};

const nowUtc = (now: Date = new Date()): string => toApiUtcString(now);

export interface LaneInput {
  name: string;
  nodeType: number;
  color?: string | null;
  minUnits?: number;
  maxUnits?: number;
  maxTimeInRole?: number;
  parentNodeId?: string | null;
  sortOrder: number;
}

export const addLaneEvent = (callId: string, input: LaneInput): CommandEvent => ({
  type: IC_EVENT.saveNode,
  payload: {
    callId,
    resolveCommandId: true,
    local: { collection: 'Nodes', idField: 'CommandStructureNodeId' },
    body: {
      CallId: numericCallId(callId),
      Name: input.name.trim(),
      NodeType: input.nodeType,
      Color: input.color ?? null,
      MinUnits: input.minUnits ?? 0,
      MaxUnits: input.maxUnits ?? 0,
      MinUnitPersonnel: 0,
      MaxUnitPersonnel: 0,
      MinTimeInRole: 0,
      MaxTimeInRole: input.maxTimeInRole ?? 0,
      ParentNodeId: input.parentNodeId ?? null,
      SortOrder: input.sortOrder,
    },
  },
});

/** Edits keep every field the server sent (SaveNode replaces the row). */
export const updateLaneEvent = (callId: string, node: CommandStructureNode, changes: Partial<CommandStructureNode>): CommandEvent => ({
  type: IC_EVENT.updateNode,
  payload: { callId, body: { ...node, ...changes } as unknown as Record<string, unknown> },
});

export const deleteLaneEvent = (callId: string, commandStructureNodeId: string): CommandEvent => ({ type: IC_EVENT.deleteNode, payload: { callId, params: { commandStructureNodeId } } });

/** `commandStructureNodeId` '' tracks the resource in the unassigned pool. */
export const assignResourceEvent = (callId: string, commandStructureNodeId: string, kind: ResourceAssignmentKind | number, resourceId: string, now?: Date): CommandEvent => ({
  type: IC_EVENT.assignResource,
  payload: {
    callId,
    resolveCommandId: true,
    local: { collection: 'Assignments', idField: 'ResourceAssignmentId' },
    body: { CallId: numericCallId(callId), CommandStructureNodeId: commandStructureNodeId, ResourceKind: kind, ResourceId: resourceId, AssignedOn: nowUtc(now), RequirementsWarning: false },
  },
});

export const moveResourceEvent = (callId: string, resourceAssignmentId: string, targetNodeId: string): CommandEvent => ({
  type: IC_EVENT.moveResource,
  payload: { callId, body: { ResourceAssignmentId: resourceAssignmentId, TargetNodeId: targetNodeId } },
});

export const releaseResourceEvent = (callId: string, resourceAssignmentId: string): CommandEvent => ({ type: IC_EVENT.releaseResource, payload: { callId, params: { resourceAssignmentId } } });

export interface ObjectiveInput {
  name: string;
  objectiveType: number;
  description?: string;
  priority?: number;
}

export const addObjectiveEvent = (callId: string, input: ObjectiveInput, sortOrder: number): CommandEvent => ({
  type: IC_EVENT.saveObjective,
  payload: {
    callId,
    resolveCommandId: true,
    local: { collection: 'Objectives', idField: 'TacticalObjectiveId' },
    body: {
      CallId: numericCallId(callId),
      Name: input.name.trim(),
      ObjectiveType: input.objectiveType,
      Status: TacticalObjectiveStatus.Pending,
      AutoPopulated: false,
      Description: input.description?.trim() ? input.description.trim() : null,
      ProgressPercent: 0,
      Priority: input.priority ?? 0,
      SortOrder: sortOrder,
    },
  },
});

export const completeObjectiveEvent = (callId: string, tacticalObjectiveId: string, outcome: number = TacticalObjectiveOutcome.Successful, note?: string | null): CommandEvent => ({
  type: IC_EVENT.completeObjective,
  payload: { callId, params: { tacticalObjectiveId }, body: { Outcome: outcome, Note: note?.trim() ? note.trim() : null } },
});

export const objectiveProgressEvent = (callId: string, tacticalObjectiveId: string, progressPercent: number): CommandEvent => ({
  type: IC_EVENT.updateObjectiveProgress,
  payload: { callId, body: { TacticalObjectiveId: tacticalObjectiveId, ProgressPercent: Math.max(0, Math.min(100, Math.round(progressPercent))) } },
});

export interface NeedInput {
  name: string;
  category: number;
  description?: string;
  quantityRequested?: number;
  priority?: number;
}

export const addNeedEvent = (callId: string, input: NeedInput, sortOrder: number, now?: Date): CommandEvent => ({
  type: IC_EVENT.saveNeed,
  payload: {
    callId,
    resolveCommandId: true,
    local: { collection: 'Needs', idField: 'IncidentNeedId' },
    body: {
      CallId: numericCallId(callId),
      Name: input.name.trim(),
      Description: input.description?.trim() ? input.description.trim() : null,
      Category: input.category,
      Status: IncidentNeedStatus.Open,
      QuantityRequested: Math.max(0, Math.round(input.quantityRequested ?? 0)),
      QuantityFulfilled: 0,
      Priority: input.priority ?? 0,
      CreatedOn: nowUtc(now),
      SortOrder: sortOrder,
    },
  },
});

export const needStatusEvent = (callId: string, incidentNeedId: string, status: number, quantityFulfilled?: number | null, note?: string | null): CommandEvent => ({
  type: IC_EVENT.setNeedStatus,
  payload: {
    callId,
    body: { IncidentNeedId: incidentNeedId, Status: status, QuantityFulfilled: quantityFulfilled ?? null, Note: note?.trim() ? note.trim() : null },
  },
});

export const startTimerEvent = (callId: string, timerId: string, name: string, intervalSeconds: number, now?: Date): CommandEvent => ({
  type: IC_EVENT.startTimer,
  payload: {
    callId,
    resolveCommandId: true,
    local: { collection: 'Timers', idField: 'IncidentTimerId' },
    body: {
      IncidentTimerId: timerId,
      CallId: numericCallId(callId),
      TimerType: IncidentTimerType.Custom,
      ScopeType: IncidentTimerScopeType.Incident,
      Name: name.trim(),
      IntervalSeconds: Math.max(60, Math.round(intervalSeconds)),
      Status: IncidentTimerStatus.Running,
      StartedOn: nowUtc(now),
    },
  },
});

export const acknowledgeTimerEvent = (callId: string, incidentTimerId: string): CommandEvent => ({ type: IC_EVENT.acknowledgeTimer, payload: { callId, params: { incidentTimerId } } });

export const assignRoleEvent = (callId: string, userId: string, roleType: number, now?: Date): CommandEvent => ({
  type: IC_EVENT.assignRole,
  payload: {
    callId,
    resolveCommandId: true,
    local: { collection: 'Roles', idField: 'IncidentRoleAssignmentId' },
    body: { CallId: numericCallId(callId), UserId: userId, RoleType: roleType, AssignedOn: nowUtc(now) },
  },
});

export const removeRoleEvent = (callId: string, incidentRoleAssignmentId: string): CommandEvent => ({ type: IC_EVENT.removeRole, payload: { callId, params: { incidentRoleAssignmentId } } });

export interface AdHocUnitInput {
  name: string;
  type?: string;
  agency?: string;
}

export const createAdHocUnitEvent = (callId: string, input: AdHocUnitInput, now?: Date): CommandEvent => ({
  type: IC_EVENT.createAdHocUnit,
  payload: {
    callId,
    body: {
      CallId: numericCallId(callId),
      Name: input.name.trim(),
      Type: input.type?.trim() ? input.type.trim() : null,
      ExternalAgencyName: input.agency?.trim() ? input.agency.trim() : null,
      CreatedOn: nowUtc(now),
    },
  },
});

export interface AdHocPersonnelInput {
  name: string;
  role?: string;
  agency?: string;
  contact?: string;
}

export const createAdHocPersonnelEvent = (callId: string, input: AdHocPersonnelInput, now?: Date): CommandEvent => ({
  type: IC_EVENT.createAdHocPersonnel,
  payload: {
    callId,
    body: {
      CallId: numericCallId(callId),
      Name: input.name.trim(),
      Role: input.role?.trim() ? input.role.trim() : null,
      ExternalAgencyName: input.agency?.trim() ? input.agency.trim() : null,
      Contact: input.contact?.trim() ? input.contact.trim() : null,
      RidingResourceKind: 0,
      RidingResourceId: null,
      CreatedOn: nowUtc(now),
    },
  },
});

export const releaseAdHocUnitEvent = (callId: string, incidentAdHocUnitId: string): CommandEvent => ({ type: IC_EVENT.releaseAdHocUnit, payload: { callId, params: { incidentAdHocUnitId } } });

export const releaseAdHocPersonnelEvent = (callId: string, incidentAdHocPersonnelId: string): CommandEvent => ({
  type: IC_EVENT.releaseAdHocPersonnel,
  payload: { callId, params: { incidentAdHocPersonnelId } },
});

export const addNoteEvent = (callId: string, body: string, visibility: number = IncidentContentVisibility.Internal, title?: string | null, now?: Date): CommandEvent => ({
  type: IC_EVENT.addNote,
  payload: {
    callId,
    resolveCommandId: true,
    local: { collection: 'Notes', idField: 'IncidentNoteId' },
    body: { CallId: numericCallId(callId), NoteType: 0, Visibility: visibility, Title: title?.trim() ? title.trim() : null, Body: body.trim(), CreatedOn: nowUtc(now) },
  },
});

export interface CommandDetailsInput {
  estimatedEndOn: string | null;
  importantInformation: string;
}

export const commandDetailsEvent = (callId: string, input: CommandDetailsInput): CommandEvent => ({
  type: IC_EVENT.updateCommandDetails,
  payload: { callId, resolveCommandId: true, body: { EstimatedEndOn: input.estimatedEndOn, ImportantInformation: input.importantInformation.trim() ? input.importantInformation.trim() : null } },
});
