import type {
  AddIncidentNoteInput,
  AdHocPersonnelListResult,
  AdHocPersonnelResult,
  AdHocUnitResult,
  AdHocUnitsResult,
  AssignPersonnelToUnitInput,
  CommandAccountabilityResult,
  CommandNodeResult,
  CommandResult,
  CommandsResult,
  CommandStructureNode,
  CommandTimelineResult,
  CommandTransferResult,
  CompleteObjectiveInput,
  CreateIncidentChannelInput,
  EstablishCommandInput,
  EvaluateAccountabilityResult,
  FormUnitInput,
  IncidentAdHocPersonnel,
  IncidentAdHocUnit,
  IncidentAfterActionReportResult,
  IncidentAttachmentResult,
  IncidentAttachmentsResult,
  IncidentCapabilitiesResult,
  IncidentCommandActionResult,
  IncidentCommandBoardResult,
  IncidentCommandResult,
  IncidentCommandSummariesResult,
  IncidentMap,
  IncidentMapAnnotation,
  IncidentMapAnnotationResult,
  IncidentMapResult,
  IncidentMapsResult,
  IncidentNeed,
  IncidentNeedEntitiesResult,
  IncidentNeedResult,
  IncidentNeedsResult,
  IncidentNeedUpdatesResult,
  IncidentNoteResult,
  IncidentNotesResult,
  IncidentReportSummaryResult,
  IncidentRoleAssignment,
  IncidentRoleResult,
  IncidentRolesResult,
  IncidentTimer,
  IncidentTimerResult,
  IncidentVoiceChannelResult,
  IncidentVoiceChannelsResult,
  LogTransmissionInput,
  MoveResourceInput,
  ReopenCommandInput,
  RequestNeedEntitiesInput,
  ResourceAssignment,
  ResourceAssignmentResult,
  ResourceIncidentViewResult,
  SaveCommandInput,
  SendMessageToCommandInput,
  SendMessageToCommandResult,
  SetNeedStatusInput,
  TacticalObjective,
  TacticalObjectiveResult,
  TransferCommandInput,
  UpdateActionPlanInput,
  UpdateCommandDetailsInput,
  UpdateCommandInfoInput,
  UpdateMapViewInput,
  UpdateObjectiveProgressInput,
  VoiceTransmissionLogResult,
  VoiceTransmissionLogsResult,
} from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for incident-command (IncidentCommand, IncidentRoles, IncidentResources, IncidentVoice, Commands, IncidentReporting). The contract test checks every entry against Swagger. */
export const incidentCommandEndpoints = defineEndpoints('incident-command', {
  acknowledgeIncidentTimer: { method: 'POST', path: '/IncidentCommand/AcknowledgeTimer/{incidentTimerId}' },
  addIncidentAttachment: { method: 'POST', path: '/IncidentCommand/AddAttachment', body: 'multipart' },
  addIncidentNote: { method: 'POST', path: '/IncidentCommand/AddNote', body: 'json' },
  assignIncidentRole: { method: 'POST', path: '/IncidentRoles/AssignRole', body: 'json' },
  assignPersonnelToUnit: { method: 'POST', path: '/IncidentResources/AssignPersonnelToUnit', body: 'json' },
  assignResource: { method: 'POST', path: '/IncidentCommand/AssignResource', body: 'json' },
  closeCommand: { method: 'PUT', path: '/IncidentCommand/CloseCommand/{incidentCommandId}' },
  closeIncidentChannels: { method: 'POST', path: '/IncidentVoice/CloseIncidentChannels/{callId}' },
  completeObjective: { method: 'POST', path: '/IncidentCommand/CompleteObjective/{tacticalObjectiveId}', body: 'json' },
  createAdHocPersonnel: { method: 'POST', path: '/IncidentResources/CreateAdHocPersonnel', body: 'json' },
  createAdHocUnit: { method: 'POST', path: '/IncidentResources/CreateAdHocUnit', body: 'json' },
  createIncidentChannel: { method: 'POST', path: '/IncidentVoice/CreateIncidentChannel', body: 'json' },
  deleteAnnotation: { method: 'DELETE', path: '/IncidentCommand/DeleteAnnotation/{incidentMapAnnotationId}' },
  deleteCommandDefinition: { method: 'DELETE', path: '/Commands/DeleteCommand/{commandDefinitionId}' },
  deleteIncidentMap: { method: 'DELETE', path: '/IncidentCommand/DeleteIncidentMap/{incidentMapId}' },
  deleteNode: { method: 'DELETE', path: '/IncidentCommand/DeleteNode/{commandStructureNodeId}' },
  downloadIncidentAttachment: { method: 'GET', path: '/IncidentCommand/DownloadAttachment/{incidentAttachmentId}', responseType: 'arraybuffer' },
  establishCommand: { method: 'POST', path: '/IncidentCommand/EstablishCommand', body: 'json' },
  evaluateAccountability: { method: 'POST', path: '/IncidentCommand/EvaluateAccountability/{callId}' },
  formUnit: { method: 'POST', path: '/IncidentResources/FormUnit', body: 'json' },
  getAccountability: { method: 'GET', path: '/IncidentCommand/GetAccountability/{callId}' },
  getAdHocPersonnel: { method: 'GET', path: '/IncidentResources/GetAdHocPersonnel/{callId}' },
  getAdHocUnits: { method: 'GET', path: '/IncidentResources/GetAdHocUnits/{callId}' },
  getAfterActionReport: { method: 'GET', path: '/IncidentReporting/GetAfterActionReport/{callId}' },
  getAllCommandDefinitions: { method: 'GET', path: '/Commands/GetAllCommands' },
  getCommandBoard: { method: 'GET', path: '/IncidentCommand/GetCommandBoard/{callId}' },
  getCommandBoardById: { method: 'GET', path: '/IncidentCommand/GetCommandBoardById/{incidentCommandId}' },
  getCommandDefinition: { method: 'GET', path: '/Commands/GetCommand/{commandDefinitionId}' },
  getCommandDefinitionForCallType: { method: 'GET', path: '/Commands/GetCommandForCallType/{callTypeId}' },
  getCommandForCall: { method: 'GET', path: '/IncidentCommand/GetCommandForCall/{callId}' },
  getCommandList: { method: 'GET', path: '/IncidentCommand/GetCommandList', query: ['includeClosed'] },
  getCommandTimeline: { method: 'GET', path: '/IncidentCommand/GetTimeline/{callId}' },
  getIncidentAttachments: { method: 'GET', path: '/IncidentCommand/GetAttachments/{callId}' },
  getIncidentMaps: { method: 'GET', path: '/IncidentCommand/GetIncidentMaps/{callId}' },
  getIncidentNeeds: { method: 'GET', path: '/IncidentCommand/GetNeeds/{callId}' },
  getIncidentNotes: { method: 'GET', path: '/IncidentCommand/GetNotes/{callId}' },
  getIncidentRoles: { method: 'GET', path: '/IncidentRoles/GetRoles/{callId}' },
  getIncidentSummary: { method: 'GET', path: '/IncidentReporting/GetIncidentSummary/{callId}' },
  getIncidentTransmissionLog: { method: 'GET', path: '/IncidentVoice/GetTransmissionLog/{callId}' },
  getIncidentVoiceChannels: { method: 'GET', path: '/IncidentVoice/GetChannelsForCall/{callId}' },
  getMyIncidentCapabilities: { method: 'GET', path: '/IncidentRoles/GetMyCapabilities/{callId}' },
  getNeedEntities: { method: 'GET', path: '/IncidentCommand/GetNeedEntities/{incidentNeedId}' },
  getNeedUpdates: { method: 'GET', path: '/IncidentCommand/GetNeedUpdates/{incidentNeedId}' },
  getResourceIncidentView: { method: 'GET', path: '/IncidentCommand/GetResourceIncidentView/{callId}', query: ['unitId'] },
  logIncidentTransmission: { method: 'POST', path: '/IncidentVoice/LogTransmission', body: 'json' },
  moveResource: { method: 'POST', path: '/IncidentCommand/MoveResource', body: 'json' },
  releaseAdHocPersonnel: { method: 'POST', path: '/IncidentResources/ReleaseAdHocPersonnel/{incidentAdHocPersonnelId}' },
  releaseAdHocUnit: { method: 'POST', path: '/IncidentResources/ReleaseAdHocUnit/{incidentAdHocUnitId}' },
  releaseResource: { method: 'POST', path: '/IncidentCommand/ReleaseResource/{resourceAssignmentId}' },
  removeIncidentAttachment: { method: 'DELETE', path: '/IncidentCommand/RemoveAttachment/{incidentAttachmentId}' },
  removeIncidentNote: { method: 'DELETE', path: '/IncidentCommand/RemoveNote/{incidentNoteId}' },
  removeIncidentRole: { method: 'POST', path: '/IncidentRoles/RemoveRole/{incidentRoleAssignmentId}' },
  reopenCommand: { method: 'PUT', path: '/IncidentCommand/ReopenCommand', body: 'json' },
  requestNeedEntities: { method: 'POST', path: '/IncidentCommand/RequestNeedEntities', body: 'json' },
  saveAnnotation: { method: 'POST', path: '/IncidentCommand/SaveAnnotation', body: 'json' },
  saveCommandDefinition: { method: 'POST', path: '/Commands/SaveCommand', body: 'json' },
  saveIncidentMap: { method: 'POST', path: '/IncidentCommand/SaveIncidentMap', body: 'json' },
  saveIncidentNeed: { method: 'POST', path: '/IncidentCommand/SaveNeed', body: 'json' },
  saveNode: { method: 'POST', path: '/IncidentCommand/SaveNode', body: 'json' },
  saveObjective: { method: 'POST', path: '/IncidentCommand/SaveObjective', body: 'json' },
  sendMessageToCommand: { method: 'POST', path: '/IncidentCommand/SendMessageToCommand', body: 'json' },
  setNeedStatus: { method: 'POST', path: '/IncidentCommand/SetNeedStatus', body: 'json' },
  startIncidentTimer: { method: 'POST', path: '/IncidentCommand/StartTimer', body: 'json' },
  transferCommand: { method: 'POST', path: '/IncidentCommand/TransferCommand', body: 'json' },
  updateActionPlan: { method: 'PUT', path: '/IncidentCommand/UpdateActionPlan', body: 'json' },
  updateCommandDetails: { method: 'PUT', path: '/IncidentCommand/UpdateCommandDetails', body: 'json' },
  updateCommandInfo: { method: 'PUT', path: '/IncidentCommand/UpdateCommandInfo', body: 'json' },
  updateMapView: { method: 'PUT', path: '/IncidentCommand/UpdateMapView', body: 'json' },
  updateObjectiveProgress: { method: 'POST', path: '/IncidentCommand/UpdateObjectiveProgress', body: 'json' },
});

const E = incidentCommandEndpoints;

/** Acknowledges a timer (resets its next-due time). `POST /IncidentCommand/AcknowledgeTimer/{incidentTimerId}` — legacy: DI. */
export const acknowledgeIncidentTimer = (ctx: ApiContext, params: { incidentTimerId: string }, options?: RequestOptions): Promise<IncidentTimerResult> =>
  request<IncidentTimerResult>(ctx, E.acknowledgeIncidentTimer, { params }, options);

/** Uploads an incident-level internal or public file using multipart/form-data. `POST /IncidentCommand/AddAttachment` — legacy: I. */
export const addIncidentAttachment = (ctx: ApiContext, body: FormData, options?: RequestOptions): Promise<IncidentAttachmentResult> => request<IncidentAttachmentResult>(ctx, E.addIncidentAttachment, { body }, options);

/** Adds an internal or public operational status note to the incident. `POST /IncidentCommand/AddNote` — legacy: I. */
export const addIncidentNote = (ctx: ApiContext, body: AddIncidentNoteInput, options?: RequestOptions): Promise<IncidentNoteResult> => request<IncidentNoteResult>(ctx, E.addIncidentNote, { body }, options);

/** Assigns a Resgrid user to a functional incident-command role. `POST /IncidentRoles/AssignRole` — legacy: DI. */
export const assignIncidentRole = (ctx: ApiContext, body: IncidentRoleAssignment, options?: RequestOptions): Promise<IncidentRoleResult> => request<IncidentRoleResult>(ctx, E.assignIncidentRole, { body }, options);

/** Adds an ad-hoc person to a unit roster for accountability. `POST /IncidentResources/AssignPersonnelToUnit` — legacy: DI. */
export const assignPersonnelToUnit = (ctx: ApiContext, body: AssignPersonnelToUnitInput, options?: RequestOptions): Promise<AdHocPersonnelResult> =>
  request<AdHocPersonnelResult>(ctx, E.assignPersonnelToUnit, { body }, options);

/** Assigns a resource (own/mutual-aid/ad-hoc unit or person) to a lane. `POST /IncidentCommand/AssignResource` — legacy: DI. */
export const assignResource = (ctx: ApiContext, body: ResourceAssignment, options?: RequestOptions): Promise<ResourceAssignmentResult> => request<ResourceAssignmentResult>(ctx, E.assignResource, { body }, options);

/** Closes command on an incident. `PUT /IncidentCommand/CloseCommand/{incidentCommandId}` — legacy: DI. */
export const closeCommand = (ctx: ApiContext, params: { incidentCommandId: string }, options?: RequestOptions): Promise<IncidentCommandResult> => request<IncidentCommandResult>(ctx, E.closeCommand, { params }, options);

/** Closes all open on-demand tactical channels for a call. `POST /IncidentVoice/CloseIncidentChannels/{callId}` — legacy: DI. */
export const closeIncidentChannels = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentCommandActionResult> =>
  request<IncidentCommandActionResult>(ctx, E.closeIncidentChannels, { params }, options);

/** Marks a tactical objective complete. `POST /IncidentCommand/CompleteObjective/{tacticalObjectiveId}` — legacy: DI. */
export const completeObjective = (ctx: ApiContext, params: { tacticalObjectiveId: string }, body: CompleteObjectiveInput, options?: RequestOptions): Promise<TacticalObjectiveResult> =>
  request<TacticalObjectiveResult>(ctx, E.completeObjective, { params, body }, options);

/** Creates an ad-hoc person for a non-Resgrid resource. `POST /IncidentResources/CreateAdHocPersonnel` — legacy: DI. */
export const createAdHocPersonnel = (ctx: ApiContext, body: IncidentAdHocPersonnel, options?: RequestOptions): Promise<AdHocPersonnelResult> =>
  request<AdHocPersonnelResult>(ctx, E.createAdHocPersonnel, { body }, options);

/** Creates an ad-hoc unit for a non-Resgrid resource. `POST /IncidentResources/CreateAdHocUnit` — legacy: DI. */
export const createAdHocUnit = (ctx: ApiContext, body: IncidentAdHocUnit, options?: RequestOptions): Promise<AdHocUnitResult> => request<AdHocUnitResult>(ctx, E.createAdHocUnit, { body }, options);

/** Creates an on-demand tactical channel scoped to a call (requires the voice addon). `POST /IncidentVoice/CreateIncidentChannel` — legacy: DI. */
export const createIncidentChannel = (ctx: ApiContext, body: CreateIncidentChannelInput, options?: RequestOptions): Promise<IncidentVoiceChannelResult> =>
  request<IncidentVoiceChannelResult>(ctx, E.createIncidentChannel, { body }, options);

/** Removes a map annotation. `DELETE /IncidentCommand/DeleteAnnotation/{incidentMapAnnotationId}` — legacy: DI. */
export const deleteAnnotation = (ctx: ApiContext, params: { incidentMapAnnotationId: string }, options?: RequestOptions): Promise<IncidentCommandActionResult> =>
  request<IncidentCommandActionResult>(ctx, E.deleteAnnotation, { params }, options);

/** Deletes a command definition. `DELETE /Commands/DeleteCommand/{commandDefinitionId}` — legacy: D. */
export const deleteCommandDefinition = (ctx: ApiContext, params: { commandDefinitionId: number | string }, options?: RequestOptions): Promise<CommandResult> =>
  request<CommandResult>(ctx, E.deleteCommandDefinition, { params }, options);

/** Soft-deletes a named incident map. `DELETE /IncidentCommand/DeleteIncidentMap/{incidentMapId}` — legacy: I. */
export const deleteIncidentMap = (ctx: ApiContext, params: { incidentMapId: string }, options?: RequestOptions): Promise<IncidentCommandActionResult> =>
  request<IncidentCommandActionResult>(ctx, E.deleteIncidentMap, { params }, options);

/** Removes a command structure lane. `DELETE /IncidentCommand/DeleteNode/{commandStructureNodeId}` — legacy: DI. */
export const deleteNode = (ctx: ApiContext, params: { commandStructureNodeId: string }, options?: RequestOptions): Promise<IncidentCommandActionResult> =>
  request<IncidentCommandActionResult>(ctx, E.deleteNode, { params }, options);

/** `GET /IncidentCommand/DownloadAttachment/{incidentAttachmentId}` — legacy: I. */
export const downloadIncidentAttachment = (ctx: ApiContext, params: { incidentAttachmentId: string }, options?: RequestOptions): Promise<ArrayBuffer> =>
  request<ArrayBuffer>(ctx, E.downloadIncidentAttachment, { params }, options);

/** Establishes command on a call, optionally seeding lanes from a command definition. `POST /IncidentCommand/EstablishCommand` — legacy: DI. */
export const establishCommand = (ctx: ApiContext, body: EstablishCommandInput, options?: RequestOptions): Promise<IncidentCommandResult> => request<IncidentCommandResult>(ctx, E.establishCommand, { body }, options);

/** Runs a personnel accountability (PAR) sweep for the call, raising workflow + real-time alerts for any member newly overdue (Critical). Returns the user ids flagged this pass. Idempotent — repeated calls only re-alert after a member checks in and lapses again. `POST /IncidentCommand/EvaluateAccountability/{callId}` — legacy: DI. */
export const evaluateAccountability = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<EvaluateAccountabilityResult> =>
  request<EvaluateAccountabilityResult>(ctx, E.evaluateAccountability, { params }, options);

/** Forms a new ad-hoc unit from on-scene ad-hoc personnel. `POST /IncidentResources/FormUnit` — legacy: DI. */
export const formUnit = (ctx: ApiContext, body: FormUnitInput, options?: RequestOptions): Promise<AdHocUnitResult> => request<AdHocUnitResult>(ctx, E.formUnit, { body }, options);

/** Gets the personnel accountability / PAR status (Green/Warning/Critical) for the incident. `GET /IncidentCommand/GetAccountability/{callId}` — legacy: DI. */
export const getAccountability = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<CommandAccountabilityResult> =>
  request<CommandAccountabilityResult>(ctx, E.getAccountability, { params }, options);

/** Gets the active ad-hoc personnel for a call. `GET /IncidentResources/GetAdHocPersonnel/{callId}` — legacy: DI. */
export const getAdHocPersonnel = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<AdHocPersonnelListResult> =>
  request<AdHocPersonnelListResult>(ctx, E.getAdHocPersonnel, { params }, options);

/** Gets the active ad-hoc units for a call. `GET /IncidentResources/GetAdHocUnits/{callId}` — legacy: DI. */
export const getAdHocUnits = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<AdHocUnitsResult> => request<AdHocUnitsResult>(ctx, E.getAdHocUnits, { params }, options);

/** Gets the complete after-action report bundle for an incident. `GET /IncidentReporting/GetAfterActionReport/{callId}` — legacy: D. */
export const getAfterActionReport = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentAfterActionReportResult> =>
  request<IncidentAfterActionReportResult>(ctx, E.getAfterActionReport, { params }, options);

/** Gets all command definitions for the department. `GET /Commands/GetAllCommands` — legacy: DI. */
export const getAllCommandDefinitions = (ctx: ApiContext, options?: RequestOptions): Promise<CommandsResult> => request<CommandsResult>(ctx, E.getAllCommandDefinitions, {}, options);

/** Gets the full live command board snapshot for a call. `GET /IncidentCommand/GetCommandBoard/{callId}` — legacy: DI. */
export const getCommandBoard = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentCommandBoardResult> =>
  request<IncidentCommandBoardResult>(ctx, E.getCommandBoard, { params }, options);

/** Board snapshot for one specific command instance — including a CLOSED one (read-only history view for ended incidents). Child rows are filtered to that command, so a closed board isn't polluted by a newer command on the same call. `GET /IncidentCommand/GetCommandBoardById/{incidentCommandId}` — legacy: I. */
export const getCommandBoardById = (ctx: ApiContext, params: { incidentCommandId: string }, options?: RequestOptions): Promise<IncidentCommandBoardResult> =>
  request<IncidentCommandBoardResult>(ctx, E.getCommandBoardById, { params }, options);

/** Gets a single command definition by identifier. `GET /Commands/GetCommand/{commandDefinitionId}` — legacy: DI. */
export const getCommandDefinition = (ctx: ApiContext, params: { commandDefinitionId: number | string }, options?: RequestOptions): Promise<CommandResult> =>
  request<CommandResult>(ctx, E.getCommandDefinition, { params }, options);

/** Resolves the command definition (template) for a call type, falling back to the "Any Call Type" definition. Pass 0 to request the "Any Call Type" template directly. `GET /Commands/GetCommandForCallType/{callTypeId}` — legacy: DI. */
export const getCommandDefinitionForCallType = (ctx: ApiContext, params: { callTypeId: number | string }, options?: RequestOptions): Promise<CommandResult> =>
  request<CommandResult>(ctx, E.getCommandDefinitionForCallType, { params }, options);

/** Gets the most recent command for a call across ALL statuses (unlike GetCommandBoard, which only resolves the active one). Lets the IC app detect a prior ended command and offer to reopen it. `GET /IncidentCommand/GetCommandForCall/{callId}` — legacy: I. */
export const getCommandForCall = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentCommandResult> =>
  request<IncidentCommandResult>(ctx, E.getCommandForCall, { params }, options);

/** List-card summaries for the department's commands: duration, resolved commander name, locations, and active unit/personnel counts. Active only by default; includeClosed=true adds ended incidents. `GET /IncidentCommand/GetCommandList` — legacy: I. */
export const getCommandList = (ctx: ApiContext, params: { includeClosed?: boolean } = {}, options?: RequestOptions): Promise<IncidentCommandSummariesResult> =>
  request<IncidentCommandSummariesResult>(ctx, E.getCommandList, { params }, options);

/** Gets the append-only command (ICS-201) timeline for a call. `GET /IncidentCommand/GetTimeline/{callId}` — legacy: DI. */
export const getCommandTimeline = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<CommandTimelineResult> =>
  request<CommandTimelineResult>(ctx, E.getCommandTimeline, { params }, options);

/** `GET /IncidentCommand/GetAttachments/{callId}` — legacy: I. */
export const getIncidentAttachments = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentAttachmentsResult> =>
  request<IncidentAttachmentsResult>(ctx, E.getIncidentAttachments, { params }, options);

/** Gets the incident's named tactical maps. `GET /IncidentCommand/GetIncidentMaps/{callId}` — legacy: I. */
export const getIncidentMaps = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentMapsResult> => request<IncidentMapsResult>(ctx, E.getIncidentMaps, { params }, options);

/** Gets the command-level needs for a call. `GET /IncidentCommand/GetNeeds/{callId}` — legacy: I. */
export const getIncidentNeeds = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentNeedsResult> =>
  request<IncidentNeedsResult>(ctx, E.getIncidentNeeds, { params }, options);

/** `GET /IncidentCommand/GetNotes/{callId}` — legacy: I. */
export const getIncidentNotes = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentNotesResult> =>
  request<IncidentNotesResult>(ctx, E.getIncidentNotes, { params }, options);

/** Gets the active functional role assignments for a call. `GET /IncidentRoles/GetRoles/{callId}` — legacy: DI. */
export const getIncidentRoles = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentRolesResult> =>
  request<IncidentRolesResult>(ctx, E.getIncidentRoles, { params }, options);

/** Gets the ICS-201/209-style incident status summary. `GET /IncidentReporting/GetIncidentSummary/{callId}` — legacy: D. */
export const getIncidentSummary = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentReportSummaryResult> =>
  request<IncidentReportSummaryResult>(ctx, E.getIncidentSummary, { params }, options);

/** Gets the PTT transmission log for a call's incident channels, newest first. `GET /IncidentVoice/GetTransmissionLog/{callId}` — legacy: I. */
export const getIncidentTransmissionLog = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<VoiceTransmissionLogsResult> =>
  request<VoiceTransmissionLogsResult>(ctx, E.getIncidentTransmissionLog, { params }, options);

/** Gets the open on-demand tactical channels for a call (visible to assigned units/users). `GET /IncidentVoice/GetChannelsForCall/{callId}` — legacy: DI. */
export const getIncidentVoiceChannels = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentVoiceChannelsResult> =>
  request<IncidentVoiceChannelsResult>(ctx, E.getIncidentVoiceChannels, { params }, options);

/** Gets the current user's effective capabilities for an incident (drives the app's view gating). `GET /IncidentRoles/GetMyCapabilities/{callId}` — legacy: DI. */
export const getMyIncidentCapabilities = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentCapabilitiesResult> =>
  request<IncidentCapabilitiesResult>(ctx, E.getMyIncidentCapabilities, { params }, options);

/** The requested entities under one Entity-category need. `GET /IncidentCommand/GetNeedEntities/{incidentNeedId}` — legacy: I. */
export const getNeedEntities = (ctx: ApiContext, params: { incidentNeedId: string }, options?: RequestOptions): Promise<IncidentNeedEntitiesResult> =>
  request<IncidentNeedEntitiesResult>(ctx, E.getNeedEntities, { params }, options);

/** Audit trail for one need: every fulfillment change with note, author, and timestamp (newest first). `GET /IncidentCommand/GetNeedUpdates/{incidentNeedId}` — legacy: I. */
export const getNeedUpdates = (ctx: ApiContext, params: { incidentNeedId: string }, options?: RequestOptions): Promise<IncidentNeedUpdatesResult> =>
  request<IncidentNeedUpdatesResult>(ctx, E.getNeedUpdates, { params }, options);

/** Read-only incident view for the calling responder (or, with unitId, a unit client): commander contact, timing, important information, objectives, needs, notes and attachments (visibility- filtered), plus the caller's own lane assignment with leads and lane objectives. Gated by the Call resource claim — every dispatched responder/unit can read it, not only command staff. `GET /IncidentCommand/GetResourceIncidentView/{callId}` — legacy: RU. */
export const getResourceIncidentView = (ctx: ApiContext, params: { callId: number | string; unitId?: number | string }, options?: RequestOptions): Promise<ResourceIncidentViewResult> =>
  request<ResourceIncidentViewResult>(ctx, E.getResourceIncidentView, { params }, options);

/** Logs one completed PTT transmission on an incident channel (who keyed up, start/end). `POST /IncidentVoice/LogTransmission` — legacy: I. */
export const logIncidentTransmission = (ctx: ApiContext, body: LogTransmissionInput, options?: RequestOptions): Promise<VoiceTransmissionLogResult> =>
  request<VoiceTransmissionLogResult>(ctx, E.logIncidentTransmission, { body }, options);

/** Moves a resource assignment to a different lane. `POST /IncidentCommand/MoveResource` — legacy: DI. */
export const moveResource = (ctx: ApiContext, body: MoveResourceInput, options?: RequestOptions): Promise<ResourceAssignmentResult> => request<ResourceAssignmentResult>(ctx, E.moveResource, { body }, options);

/** Releases an ad-hoc person. `POST /IncidentResources/ReleaseAdHocPersonnel/{incidentAdHocPersonnelId}` — legacy: DI. */
export const releaseAdHocPersonnel = (ctx: ApiContext, params: { incidentAdHocPersonnelId: string }, options?: RequestOptions): Promise<IncidentCommandActionResult> =>
  request<IncidentCommandActionResult>(ctx, E.releaseAdHocPersonnel, { params }, options);

/** Releases an ad-hoc unit. `POST /IncidentResources/ReleaseAdHocUnit/{incidentAdHocUnitId}` — legacy: DI. */
export const releaseAdHocUnit = (ctx: ApiContext, params: { incidentAdHocUnitId: string }, options?: RequestOptions): Promise<IncidentCommandActionResult> =>
  request<IncidentCommandActionResult>(ctx, E.releaseAdHocUnit, { params }, options);

/** Releases a resource assignment. `POST /IncidentCommand/ReleaseResource/{resourceAssignmentId}` — legacy: DI. */
export const releaseResource = (ctx: ApiContext, params: { resourceAssignmentId: string }, options?: RequestOptions): Promise<IncidentCommandActionResult> =>
  request<IncidentCommandActionResult>(ctx, E.releaseResource, { params }, options);

/** `DELETE /IncidentCommand/RemoveAttachment/{incidentAttachmentId}` — legacy: I. */
export const removeIncidentAttachment = (ctx: ApiContext, params: { incidentAttachmentId: string }, options?: RequestOptions): Promise<IncidentCommandActionResult> =>
  request<IncidentCommandActionResult>(ctx, E.removeIncidentAttachment, { params }, options);

/** `DELETE /IncidentCommand/RemoveNote/{incidentNoteId}` — legacy: I. */
export const removeIncidentNote = (ctx: ApiContext, params: { incidentNoteId: string }, options?: RequestOptions): Promise<IncidentCommandActionResult> =>
  request<IncidentCommandActionResult>(ctx, E.removeIncidentNote, { params }, options);

/** Removes a functional incident-command role assignment. `POST /IncidentRoles/RemoveRole/{incidentRoleAssignmentId}` — legacy: DI. */
export const removeIncidentRole = (ctx: ApiContext, params: { incidentRoleAssignmentId: string }, options?: RequestOptions): Promise<IncidentCommandActionResult> =>
  request<IncidentCommandActionResult>(ctx, E.removeIncidentRole, { params }, options);

/** Reopens a previously closed command with a reason. Bootstrap-gated like EstablishCommand: after a close there is no active command, so incident capabilities cannot be evaluated — the department-level Command_Create claim is the gate. `PUT /IncidentCommand/ReopenCommand` — legacy: I. */
export const reopenCommand = (ctx: ApiContext, body: ReopenCommandInput, options?: RequestOptions): Promise<IncidentCommandResult> => request<IncidentCommandResult>(ctx, E.reopenCommand, { body }, options);

/** Creates an Entity need requesting specific units/users/roles/groups; they are added to the call and dispatched individually as "Requested by Incident Command". `POST /IncidentCommand/RequestNeedEntities` — legacy: I. */
export const requestNeedEntities = (ctx: ApiContext, body: RequestNeedEntitiesInput, options?: RequestOptions): Promise<IncidentNeedResult> => request<IncidentNeedResult>(ctx, E.requestNeedEntities, { body }, options);

/** Creates or updates a real-time map annotation. `POST /IncidentCommand/SaveAnnotation` — legacy: DI. */
export const saveAnnotation = (ctx: ApiContext, body: IncidentMapAnnotation, options?: RequestOptions): Promise<IncidentMapAnnotationResult> =>
  request<IncidentMapAnnotationResult>(ctx, E.saveAnnotation, { body }, options);

/** Creates or updates a command definition (including its lanes). `POST /Commands/SaveCommand` — legacy: D. */
export const saveCommandDefinition = (ctx: ApiContext, body: SaveCommandInput, options?: RequestOptions): Promise<CommandResult> => request<CommandResult>(ctx, E.saveCommandDefinition, { body }, options);

/** Creates or updates a NAMED incident map (name, description, framing, optional expiry). Audit fields stamp server-side; the change logs to the incident timeline with author + ICS standing. `POST /IncidentCommand/SaveIncidentMap` — legacy: I. */
export const saveIncidentMap = (ctx: ApiContext, body: IncidentMap, options?: RequestOptions): Promise<IncidentMapResult> => request<IncidentMapResult>(ctx, E.saveIncidentMap, { body }, options);

/** Creates or updates a command-level incident need (resources/logistics/etc.). `POST /IncidentCommand/SaveNeed` — legacy: I. */
export const saveIncidentNeed = (ctx: ApiContext, body: IncidentNeed, options?: RequestOptions): Promise<IncidentNeedResult> => request<IncidentNeedResult>(ctx, E.saveIncidentNeed, { body }, options);

/** Creates or updates a command structure lane. `POST /IncidentCommand/SaveNode` — legacy: DI. */
export const saveNode = (ctx: ApiContext, body: CommandStructureNode, options?: RequestOptions): Promise<CommandNodeResult> => request<CommandNodeResult>(ctx, E.saveNode, { body }, options);

/** Creates or updates a tactical objective / benchmark. `POST /IncidentCommand/SaveObjective` — legacy: DI. */
export const saveObjective = (ctx: ApiContext, body: TacticalObjective, options?: RequestOptions): Promise<TacticalObjectiveResult> => request<TacticalObjectiveResult>(ctx, E.saveObjective, { body }, options);

/** Sends a free-form message from the caller directly to the incident's current commander (and, when IncludeDeputies is set, any assigned Deputy Incident Commanders) over their configured notification channels. Only usable on an active command with a current commander. `POST /IncidentCommand/SendMessageToCommand` — legacy: I. */
export const sendMessageToCommand = (ctx: ApiContext, body: SendMessageToCommandInput, options?: RequestOptions): Promise<SendMessageToCommandResult> =>
  request<SendMessageToCommandResult>(ctx, E.sendMessageToCommand, { body }, options);

/** Transitions an incident need's fulfillment status (Open/PartiallyMet/Met/Cancelled). `POST /IncidentCommand/SetNeedStatus` — legacy: I. */
export const setNeedStatus = (ctx: ApiContext, body: SetNeedStatusInput, options?: RequestOptions): Promise<IncidentNeedResult> => request<IncidentNeedResult>(ctx, E.setNeedStatus, { body }, options);

/** Starts a scene/benchmark/role timer. `POST /IncidentCommand/StartTimer` — legacy: DI. */
export const startIncidentTimer = (ctx: ApiContext, body: IncidentTimer, options?: RequestOptions): Promise<IncidentTimerResult> => request<IncidentTimerResult>(ctx, E.startIncidentTimer, { body }, options);

/** Transfers command to another user. `POST /IncidentCommand/TransferCommand` — legacy: DI. */
export const transferCommand = (ctx: ApiContext, body: TransferCommandInput, options?: RequestOptions): Promise<CommandTransferResult> => request<CommandTransferResult>(ctx, E.transferCommand, { body }, options);

/** Updates the incident action plan. `PUT /IncidentCommand/UpdateActionPlan` — legacy: DI. */
export const updateActionPlan = (ctx: ApiContext, body: UpdateActionPlanInput, options?: RequestOptions): Promise<IncidentCommandResult> => request<IncidentCommandResult>(ctx, E.updateActionPlan, { body }, options);

/** Updates command-level details every resource should see: estimated end and important information. `PUT /IncidentCommand/UpdateCommandDetails` — legacy: I. */
export const updateCommandDetails = (ctx: ApiContext, body: UpdateCommandDetailsInput, options?: RequestOptions): Promise<IncidentCommandResult> =>
  request<IncidentCommandResult>(ctx, E.updateCommandDetails, { body }, options);

/** Updates core incident metadata (name, corrected start time, estimated end, important information, ICS level) and the ICP/HQ, Staging, and Rehab locations. A location whose text is supplied without coordinates is geocoded server-side on save. `PUT /IncidentCommand/UpdateCommandInfo` — legacy: I. */
export const updateCommandInfo = (ctx: ApiContext, body: UpdateCommandInfoInput, options?: RequestOptions): Promise<IncidentCommandResult> => request<IncidentCommandResult>(ctx, E.updateCommandInfo, { body }, options);

/** Creates or updates the incident map's saved view (center + zoom). Logged to the incident timeline with the author's name and ICS standing. `PUT /IncidentCommand/UpdateMapView` — legacy: I. */
export const updateMapView = (ctx: ApiContext, body: UpdateMapViewInput, options?: RequestOptions): Promise<IncidentCommandResult> => request<IncidentCommandResult>(ctx, E.updateMapView, { body }, options);

/** Sets a tactical objective's progress (0-100; 100 completes it). `POST /IncidentCommand/UpdateObjectiveProgress` — legacy: I. */
export const updateObjectiveProgress = (ctx: ApiContext, body: UpdateObjectiveProgressInput, options?: RequestOptions): Promise<TacticalObjectiveResult> =>
  request<TacticalObjectiveResult>(ctx, E.updateObjectiveProgress, { body }, options);
