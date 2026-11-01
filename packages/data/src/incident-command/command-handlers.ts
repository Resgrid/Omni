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
  SetNeedStatusInput,
  TacticalObjective,
  UpdateCommandDetailsInput,
  UpdateObjectiveProgressInput,
} from '@resgrid/models';
import type { OutboxHandler } from '@resgrid/offline';

import { assertV4Success, unwrapItem } from '../core/envelope';
import { defineDataHandler } from '../core/outbox';
import { getDataApiContext } from '../core/runtime';
import { IC_EVENT, type IcEventPayload, type IcEventType, useCommandStore } from './command-store';

class NoIncidentCommandError extends Error {
  constructor() {
    super('No active incident command for the call yet.');
    this.name = 'NoIncidentCommandError';
  }
}

/** The server IncidentCommandId for a call (writes queued before the command existed). Retried until the establish lands. */
const resolveIncidentCommandId = async (ctx: ApiContext, callId: string): Promise<string> => {
  const known = useCommandStore.getState().boards[callId]?.board?.Command?.IncidentCommandId;
  if (known && !known.startsWith('local-')) return known;
  const board = unwrapItem(await getCommandBoard(ctx, { callId }));
  const id = board?.Command?.IncidentCommandId;
  if (!id) throw new NoIncidentCommandError();
  return id;
};

const param = (payload: IcEventPayload, name: string): string => payload.params?.[name] ?? '';

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
  [IC_EVENT.saveNode]: (ctx, _payload, body) => saveNode(ctx, body as unknown as CommandStructureNode),
  [IC_EVENT.updateNode]: (ctx, _payload, body) => saveNode(ctx, body as unknown as CommandStructureNode),
  [IC_EVENT.deleteNode]: (ctx, payload) => deleteNode(ctx, { commandStructureNodeId: param(payload, 'commandStructureNodeId') }),
  [IC_EVENT.assignResource]: (ctx, _payload, body) => assignResource(ctx, body as unknown as ResourceAssignment),
  [IC_EVENT.moveResource]: (ctx, _payload, body) => moveResource(ctx, body as unknown as MoveResourceInput),
  [IC_EVENT.releaseResource]: (ctx, payload) => releaseResource(ctx, { resourceAssignmentId: param(payload, 'resourceAssignmentId') }),
  [IC_EVENT.saveObjective]: (ctx, _payload, body) => saveObjective(ctx, body as unknown as TacticalObjective),
  [IC_EVENT.completeObjective]: (ctx, payload, body) => completeObjective(ctx, { tacticalObjectiveId: param(payload, 'tacticalObjectiveId') }, body as unknown as CompleteObjectiveInput),
  [IC_EVENT.updateObjectiveProgress]: (ctx, _payload, body) => updateObjectiveProgress(ctx, body as unknown as UpdateObjectiveProgressInput),
  [IC_EVENT.saveNeed]: (ctx, _payload, body) => saveIncidentNeed(ctx, body as unknown as IncidentNeed),
  [IC_EVENT.setNeedStatus]: (ctx, _payload, body) => setNeedStatus(ctx, body as unknown as SetNeedStatusInput),
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
      useCommandStore.getState().addLocalRow({ eventId: event.id, callId, collection: local.collection, row: { ...(body ?? {}), [local.idField]: `local-${event.id}`, __localEventId: event.id } });
    },
    send: async (event) => {
      const ctx = getDataApiContext();
      const body = { ...(event.payload.body ?? {}) };
      if (event.payload.resolveCommandId) body.IncidentCommandId = await resolveIncidentCommandId(ctx, event.payload.callId);
      return assertV4Success(await SENDERS[type](ctx, event.payload, body));
    },
    afterAck: async (event) => {
      const store = useCommandStore.getState();
      store.removeLocalRow(event.id);
      if (type === IC_EVENT.establishCommand) store.markBoardEstablished(event.payload.callId);
      if (!NO_REFRESH.has(type) && store.boards[event.payload.callId]) await store.refreshBoard(event.payload.callId);
    },
    rollback: (event) => useCommandStore.getState().removeLocalRow(event.id),
  });

/** The 26 IC outbox handlers. */
export const incidentCommandHandlers: OutboxHandler<IcEventPayload, unknown>[] = (Object.values(IC_EVENT) as IcEventType[]).map(createIcHandler);
