import {
  acknowledgeIncidentTimer,
  addIncidentNote,
  type ApiContext,
  assignIncidentRole,
  assignResource,
  type CloseCallRequest,
  closeCallWith,
  closeCommand,
  completeObjective,
  createAdHocPersonnel,
  createAdHocUnit,
  deleteAnnotation,
  deleteNode,
  establishCommand,
  getCommandBoard,
  moveResource,
  releaseAdHocPersonnel,
  releaseAdHocUnit,
  releaseResource,
  removeIncidentRole,
  saveAnnotation,
  saveIncidentNeed,
  saveNode,
  saveObjective,
  setNeedStatus,
  startIncidentTimer,
  updateCommandDetails,
  updateObjectiveProgress,
} from '@resgrid/api';
import type {
  AddIncidentNoteInput,
  CommandStructureNode,
  CompleteObjectiveInput,
  EstablishCommandInput,
  IncidentAdHocPersonnel,
  IncidentAdHocUnit,
  IncidentMapAnnotation,
  IncidentNeed,
  IncidentRoleAssignment,
  IncidentTimer,
  MoveResourceInput,
  ResourceAssignment,
  ResourceAssignmentResult,
  SetNeedStatusInput,
  TacticalObjective,
  UpdateCommandDetailsInput,
  UpdateObjectiveProgressInput,
} from '@resgrid/models';
import type { OutboxHandler } from '@resgrid/offline';

import { assertV4Success, unwrapItem } from '../core/envelope';
import { defineDataHandler } from '../core/outbox';
import { getDataApiContext, getDataLogger } from '../core/runtime';
import { IC_EVENT, type IcEventPayload, type IcEventType, LOCAL_ID_PREFIX, useCommandStore } from './command-store';

class NoIncidentCommandError extends Error {
  constructor() {
    super('No active incident command for the call yet.');
    this.name = 'NoIncidentCommandError';
  }
}

class PendingCreateError extends Error {
  constructor() {
    super('The board item this write refers to has not reached the server yet.');
    this.name = 'PendingCreateError';
  }
}

/**
 * The server id for a board row id. A row created offline carries `local-<eventId>` until its create is acknowledged,
 * and writes queued against it meanwhile (moving a resource assigned offline, filling, editing or nesting under a lane
 * added offline) still name that id. Writes for one incident replay in order, so by the time such a write is sent its
 * create has been acknowledged and has recorded the server's id. A create still queued holds the write back (retried);
 * one that was refused or discarded left nothing on the server, and the id goes as it is for the server to answer.
 */
function toServerId(id: string): string;
function toServerId(id: string | null | undefined): string | null | undefined;
function toServerId(id: string | null | undefined): string | null | undefined {
  if (!id?.startsWith(LOCAL_ID_PREFIX)) return id;

  const { pendingLocalRows, resolvedLocalIds } = useCommandStore.getState();
  const resolved = resolvedLocalIds[id];

  if (resolved) return resolved.serverId;

  if (pendingLocalRows[id.slice(LOCAL_ID_PREFIX.length)]) throw new PendingCreateError();

  return id;
}

/** How Core answers a board create: the saved row, its id field holding the id the server gave it. */
interface CreateAck {
  Data?: Partial<Record<string, string | null>> | null;
}

const createdId = (ack: CreateAck | null, idField: string): string | null => ack?.Data?.[idField] || null;

/** The server IncidentCommandId for a call (writes queued before the command existed). Retried until the establish lands. */
const resolveIncidentCommandId = async (ctx: ApiContext, callId: string): Promise<string> => {
  const known = useCommandStore.getState().boards[callId]?.board?.Command?.IncidentCommandId;

  if (known && !known.startsWith('local-')) return known;
  const board = unwrapItem(await getCommandBoard(ctx, { callId }));
  const id = board?.Command?.IncidentCommandId;

  if (!id) throw new NoIncidentCommandError();

  return id;
};

/** A path/query id, as the server knows it. */
const param = (payload: IcEventPayload, name: string): string => toServerId(payload.params?.[name] ?? '');

const nodeWithServerIds = (node: CommandStructureNode): CommandStructureNode => ({ ...node, CommandStructureNodeId: toServerId(node.CommandStructureNodeId), ParentNodeId: toServerId(node.ParentNodeId) });

/** The board's row for an assignment, else the server's (the board may not have refreshed since the write was queued). */
const findAssignment = async (ctx: ApiContext, callId: string, resourceAssignmentId: string): Promise<ResourceAssignment | null> => {
  const known = useCommandStore.getState().boards[callId]?.board?.Assignments?.find((row) => row.ResourceAssignmentId === resourceAssignmentId);

  if (known) return known;

  const board = unwrapItem(await getCommandBoard(ctx, { callId }));

  return board?.Assignments?.find((row) => row.ResourceAssignmentId === resourceAssignmentId) ?? null;
};

/**
 * Core's MoveResource only targets a lane (a blank TargetNodeId is a 400), so a move back to the unassigned pool
 * re-saves the assignment through AssignResource, which upserts by id and keeps a blank node as the pool. An
 * assignment no longer on the board has nothing to move — delivered, like MoveResource's own not_found.
 */
const sendMoveResource = async (ctx: ApiContext, callId: string, queued: MoveResourceInput): Promise<ResourceAssignmentResult | null> => {
  const input: MoveResourceInput = { ResourceAssignmentId: toServerId(queued.ResourceAssignmentId), TargetNodeId: toServerId(queued.TargetNodeId) };

  if (input.TargetNodeId?.trim()) return moveResource(ctx, input);

  const assignment = await findAssignment(ctx, callId, input.ResourceAssignmentId);

  return assignment ? assignResource(ctx, { ...assignment, CommandStructureNodeId: '' }) : null;
};

type Sender = (ctx: ApiContext, payload: IcEventPayload, body: Record<string, unknown>) => Promise<unknown>;

/** One sender per IC event type (IC `offline-event-manager` replay table, on the typed registry). */
const SENDERS: Record<IcEventType, Sender> = {
  [IC_EVENT.establishCommand]: (ctx, _payload, body) => establishCommand(ctx, body as unknown as EstablishCommandInput),
  [IC_EVENT.closeCommand]: (ctx, payload) => closeCommand(ctx, { incidentCommandId: param(payload, 'incidentCommandId') }),
  [IC_EVENT.closeCall]: (ctx, _payload, body) => closeCallWith(ctx, body as unknown as CloseCallRequest),
  [IC_EVENT.updateCommandDetails]: (ctx, _payload, body) => updateCommandDetails(ctx, body as unknown as UpdateCommandDetailsInput),
  [IC_EVENT.assignRole]: (ctx, _payload, body) => assignIncidentRole(ctx, body as unknown as IncidentRoleAssignment),
  [IC_EVENT.removeRole]: (ctx, payload) => removeIncidentRole(ctx, { incidentRoleAssignmentId: param(payload, 'incidentRoleAssignmentId') }),
  [IC_EVENT.createAdHocUnit]: (ctx, _payload, body) => createAdHocUnit(ctx, body as unknown as IncidentAdHocUnit),
  [IC_EVENT.releaseAdHocUnit]: (ctx, payload) => releaseAdHocUnit(ctx, { incidentAdHocUnitId: param(payload, 'incidentAdHocUnitId') }),
  [IC_EVENT.createAdHocPersonnel]: (ctx, _payload, body) => createAdHocPersonnel(ctx, body as unknown as IncidentAdHocPersonnel),
  [IC_EVENT.releaseAdHocPersonnel]: (ctx, payload) => releaseAdHocPersonnel(ctx, { incidentAdHocPersonnelId: param(payload, 'incidentAdHocPersonnelId') }),
  [IC_EVENT.saveNode]: (ctx, _payload, body) => saveNode(ctx, nodeWithServerIds(body as unknown as CommandStructureNode)),
  [IC_EVENT.updateNode]: (ctx, _payload, body) => saveNode(ctx, nodeWithServerIds(body as unknown as CommandStructureNode)),
  [IC_EVENT.deleteNode]: (ctx, payload) => deleteNode(ctx, { commandStructureNodeId: param(payload, 'commandStructureNodeId') }),
  [IC_EVENT.assignResource]: (ctx, _payload, body) => {
    const assignment = body as unknown as ResourceAssignment;

    return assignResource(ctx, { ...assignment, CommandStructureNodeId: toServerId(assignment.CommandStructureNodeId) });
  },
  [IC_EVENT.moveResource]: (ctx, payload, body) => sendMoveResource(ctx, payload.callId, body as unknown as MoveResourceInput),
  [IC_EVENT.releaseResource]: (ctx, payload) => releaseResource(ctx, { resourceAssignmentId: param(payload, 'resourceAssignmentId') }),
  [IC_EVENT.saveObjective]: (ctx, _payload, body) => saveObjective(ctx, body as unknown as TacticalObjective),
  [IC_EVENT.completeObjective]: (ctx, payload, body) => completeObjective(ctx, { tacticalObjectiveId: param(payload, 'tacticalObjectiveId') }, body as unknown as CompleteObjectiveInput),
  [IC_EVENT.updateObjectiveProgress]: (ctx, _payload, body) => {
    const input = body as unknown as UpdateObjectiveProgressInput;

    return updateObjectiveProgress(ctx, { ...input, TacticalObjectiveId: toServerId(input.TacticalObjectiveId) });
  },
  [IC_EVENT.saveNeed]: (ctx, _payload, body) => saveIncidentNeed(ctx, body as unknown as IncidentNeed),
  [IC_EVENT.setNeedStatus]: (ctx, _payload, body) => {
    const input = body as unknown as SetNeedStatusInput;

    return setNeedStatus(ctx, { ...input, IncidentNeedId: toServerId(input.IncidentNeedId) });
  },
  [IC_EVENT.startTimer]: (ctx, _payload, body) => startIncidentTimer(ctx, body as unknown as IncidentTimer),
  [IC_EVENT.acknowledgeTimer]: (ctx, payload) => acknowledgeIncidentTimer(ctx, { incidentTimerId: param(payload, 'incidentTimerId') }),
  [IC_EVENT.saveAnnotation]: (ctx, _payload, body) => saveAnnotation(ctx, body as unknown as IncidentMapAnnotation),
  [IC_EVENT.deleteAnnotation]: (ctx, payload) => deleteAnnotation(ctx, { incidentMapAnnotationId: param(payload, 'incidentMapAnnotationId') }),
  [IC_EVENT.addNote]: (ctx, _payload, body) => addIncidentNote(ctx, body as unknown as AddIncidentNoteInput),
};

/** Types whose acknowledgement does not refresh a board (the board is gone, or it is the call). */
const NO_REFRESH = new Set<IcEventType>([IC_EVENT.closeCommand, IC_EVENT.closeCall]);

const createIcHandler = (type: IcEventType): OutboxHandler<IcEventPayload, unknown> =>
  defineDataHandler<IcEventPayload, unknown>({
    type,
    optimisticApply: (event) => {
      const { local, body, callId } = event.payload;

      if (!local) return;
      useCommandStore.getState().addLocalRow({ eventId: event.id, callId, collection: local.collection, row: { ...(body ?? {}), [local.idField]: `${LOCAL_ID_PREFIX}${event.id}`, __localEventId: event.id } });
    },
    send: async (event) => {
      const ctx = getDataApiContext();
      const body = { ...(event.payload.body ?? {}) };

      if (event.payload.resolveCommandId) body.IncidentCommandId = await resolveIncidentCommandId(ctx, event.payload.callId);

      return assertV4Success(await SENDERS[type](ctx, event.payload, body));
    },
    afterAck: async (event, result) => {
      const store = useCommandStore.getState();
      const { local } = event.payload;

      if (local) {
        // SAFETY: `send` returned what a board create answers, the v4 envelope with the saved row in `Data`, whose id fields are strings.
        const serverId = createdId(result as CreateAck | null, local.idField);

        if (serverId) store.resolveLocalId(event.id, event.payload.callId, serverId);
        else getDataLogger().warn({ message: 'Board create acknowledged without its id; writes queued against its row go as they are', context: { type } });
      }

      store.removeLocalRow(event.id);

      if (type === IC_EVENT.establishCommand) store.markBoardEstablished(event.payload.callId);

      if (!NO_REFRESH.has(type) && store.boards[event.payload.callId]) await store.refreshBoard(event.payload.callId);
    },
    rollback: (event) => useCommandStore.getState().removeLocalRow(event.id),
  });

/** The 26 IC outbox handlers. */
export const incidentCommandHandlers: OutboxHandler<IcEventPayload, unknown>[] = (Object.values(IC_EVENT) as IcEventType[]).map(createIcHandler);
