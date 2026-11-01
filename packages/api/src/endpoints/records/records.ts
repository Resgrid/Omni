import type {
  BeginRecordUploadInput,
  CompleteRecordUploadInput,
  FieldRecordAssignmentCommandInput,
  FieldRecordAssignmentData,
  FieldRecordCatalogData,
  FieldRecordCatalogInput,
  FieldRecordPrefillData,
  FieldRecordPrefillInput,
  FieldRecordPreflightData,
  FieldRecordSyncData,
  FieldRecordSyncInput,
  FieldRecordTelemetryInput,
  FieldRecordTelemetryResult,
  RecordAttachmentIdInput,
  RecordAttachmentsResult,
  RecordCommandInput,
  RecordData,
  RecordDefinitionVersionData,
  RecordDeploymentConnectorData,
  RecordDeploymentConnectorRunApiResult,
  RecordDeploymentConnectorRunData,
  RecordDeploymentData,
  RecordDeploymentReconciliationData,
  RecordsApiResult,
  RecordUploadChunkInput,
  RecordUploadIdInput,
  RecordUploadResult,
  SaveRecordDraftInput,
} from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions, type UnknownV4Result } from '../../core';

/** Core v4 endpoints for records (Records, FieldRecords, RecordDefinitions, RecordDeployments, RecordDeploymentConnectors). The contract test checks every entry against Swagger. */
export const recordsEndpoints = defineEndpoints('records', {
  abortRecordUpload: { method: 'POST', path: '/Records/AbortUpload', body: 'json' },
  acknowledgeFieldRecordAssignment: { method: 'POST', path: '/FieldRecords/AcknowledgeAssignment', body: 'json' },
  beginRecordUpload: { method: 'POST', path: '/Records/BeginUpload', body: 'json' },
  cancelRecord: { method: 'POST', path: '/Records/Cancel', body: 'json' },
  completeFieldRecordAssignment: { method: 'POST', path: '/FieldRecords/CompleteAssignment', body: 'json' },
  completeRecordUpload: { method: 'POST', path: '/Records/CompleteUpload', body: 'json' },
  createRecordDraft: { method: 'POST', path: '/Records/CreateDraft', body: 'json' },
  finalizeRecord: { method: 'POST', path: '/Records/Finalize', body: 'json' },
  getAssignmentsForRecord: { method: 'GET', path: '/FieldRecords/RecordAssignments', query: ['recordId'] },
  getFieldRecordAssignments: { method: 'POST', path: '/FieldRecords/Assignments', body: 'json' },
  getFieldRecordPrefill: { method: 'POST', path: '/FieldRecords/Prefill', body: 'json' },
  getFieldRecordsCatalog: { method: 'POST', path: '/FieldRecords/Catalog', body: 'json' },
  getFieldRecordsPreflight: { method: 'GET', path: '/FieldRecords/Preflight', query: ['originClient', 'appVersion', 'clientCapability'] },
  getRecord: { method: 'GET', path: '/Records/GetRecord', query: ['id'] },
  getRecordAttachments: { method: 'GET', path: '/Records/GetAttachments', query: ['id'] },
  getRecordDefinitionVersion: { method: 'GET', path: '/RecordDefinitions/Version', query: ['key', 'version'] },
  getRecordDeployment: { method: 'GET', path: '/RecordDeployments/Get', query: ['id'] },
  getRecordDeploymentConnector: { method: 'GET', path: '/RecordDeploymentConnectors/Get', query: ['id'] },
  getRecordDeploymentConnectorRuns: { method: 'GET', path: '/RecordDeploymentConnectors/Runs', query: ['id', 'take'] },
  getRecordDeploymentConnectors: { method: 'GET', path: '/RecordDeploymentConnectors/List' },
  getRecordDeploymentReconciliation: { method: 'GET', path: '/RecordDeploymentConnectors/Reconciliation', query: ['id'] },
  getRecordDeployments: { method: 'GET', path: '/RecordDeployments/List', query: ['includeClosed', 'take'] },
  getRecordUpload: { method: 'GET', path: '/Records/GetUpload', query: ['uploadId'] },
  removeRecordAttachment: { method: 'POST', path: '/Records/RemoveAttachment', body: 'json' },
  reportFieldRecordTelemetry: { method: 'POST', path: '/FieldRecords/Telemetry', body: 'json' },
  runRecordDeploymentConnector: { method: 'POST', path: '/RecordDeploymentConnectors/Run', query: ['id'] },
  saveRecordDraft: { method: 'POST', path: '/Records/SaveDraft', body: 'json' },
  submitRecordForReview: { method: 'POST', path: '/Records/SubmitForReview', body: 'json' },
  syncFieldRecords: { method: 'POST', path: '/FieldRecords/Sync', body: 'json' },
  uploadRecordChunk: { method: 'POST', path: '/Records/UploadChunk', body: 'json' },
});

const E = recordsEndpoints;

/** `POST /Records/AbortUpload` — legacy: DIRU. */
export const abortRecordUpload = (ctx: ApiContext, body: RecordUploadIdInput, options?: RequestOptions): Promise<RecordsApiResult<boolean>> =>
  request<RecordsApiResult<boolean>>(ctx, E.abortRecordUpload, { body }, options);

/** `POST /FieldRecords/AcknowledgeAssignment` — legacy: DIRU. */
export const acknowledgeFieldRecordAssignment = (ctx: ApiContext, body: FieldRecordAssignmentCommandInput, options?: RequestOptions): Promise<RecordsApiResult<FieldRecordAssignmentData>> =>
  request<RecordsApiResult<FieldRecordAssignmentData>>(ctx, E.acknowledgeFieldRecordAssignment, { body }, options);

/** Opens a resumable upload session (plan 5.3): declare size and SHA-256; send chunks with UploadChunk; finish with CompleteUpload. `POST /Records/BeginUpload` — legacy: DIRU. */
export const beginRecordUpload = (ctx: ApiContext, body: BeginRecordUploadInput, options?: RequestOptions): Promise<UnknownV4Result> => request<UnknownV4Result>(ctx, E.beginRecordUpload, { body }, options);

/** `POST /Records/Cancel` — legacy: DIRU. */
export const cancelRecord = (ctx: ApiContext, body: RecordCommandInput, options?: RequestOptions): Promise<RecordsApiResult<RecordData>> => request<RecordsApiResult<RecordData>>(ctx, E.cancelRecord, { body }, options);

/** `POST /FieldRecords/CompleteAssignment` — legacy: DIRU. */
export const completeFieldRecordAssignment = (ctx: ApiContext, body: FieldRecordAssignmentCommandInput, options?: RequestOptions): Promise<RecordsApiResult<FieldRecordAssignmentData>> =>
  request<RecordsApiResult<FieldRecordAssignmentData>>(ctx, E.completeFieldRecordAssignment, { body }, options);

/** Verifies size and SHA-256, then stores the attachment through hygiene and the scanner. 422 on checksum mismatch or rejection. `POST /Records/CompleteUpload` — legacy: DIRU. */
export const completeRecordUpload = (ctx: ApiContext, body: CompleteRecordUploadInput, options?: RequestOptions): Promise<UnknownV4Result> => request<UnknownV4Result>(ctx, E.completeRecordUpload, { body }, options);

/** Creates a draft. IdempotencyKey (body or Idempotency-Key header) makes the create replayable: the same key returns the existing record with 200 instead of a duplicate. Field clients need their Records.Field.* flag. `POST /Records/CreateDraft` — legacy: DIRU. */
export const createRecordDraft = (ctx: ApiContext, body: SaveRecordDraftInput, options?: RequestOptions): Promise<RecordsApiResult<RecordData>> =>
  request<RecordsApiResult<RecordData>>(ctx, E.createRecordDraft, { body }, options);

/** Finalize: validates, writes the immutable revision and attestation, emits the lifecycle events. Attested must be true. Online-only by design. `POST /Records/Finalize` — legacy: DIRU. */
export const finalizeRecord = (ctx: ApiContext, body: RecordCommandInput, options?: RequestOptions): Promise<RecordsApiResult<RecordData>> =>
  request<RecordsApiResult<RecordData>>(ctx, E.finalizeRecord, { body }, options);

/** Assignments on one Record; empty when the caller cannot read that Record. `GET /FieldRecords/RecordAssignments` — legacy: DIRU. */
export const getAssignmentsForRecord = (ctx: ApiContext, params: { recordId: string }, options?: RequestOptions): Promise<RecordsApiResult<FieldRecordAssignmentData[]>> =>
  request<RecordsApiResult<FieldRecordAssignmentData[]>>(ctx, E.getAssignmentsForRecord, { params }, options);

/** The caller's open work queue, narrowed by assignment and re-authorized per Record. `POST /FieldRecords/Assignments` — legacy: DIRU. */
export const getFieldRecordAssignments = (ctx: ApiContext, body: FieldRecordCatalogInput, options?: RequestOptions): Promise<RecordsApiResult<FieldRecordAssignmentData[]>> =>
  request<RecordsApiResult<FieldRecordAssignmentData[]>>(ctx, E.getFieldRecordAssignments, { body }, options);

/** Server-calculated prefill for one catalog entry; refused when that entry is not in this client's catalog. `POST /FieldRecords/Prefill` — legacy: DIRU. */
export const getFieldRecordPrefill = (ctx: ApiContext, body: FieldRecordPrefillInput, options?: RequestOptions): Promise<RecordsApiResult<FieldRecordPrefillData>> =>
  request<RecordsApiResult<FieldRecordPrefillData>>(ctx, E.getFieldRecordPrefill, { body }, options);

/** The definitions this app may start right now, plus a coded reason for each one withheld. `POST /FieldRecords/Catalog` — legacy: DIRU. */
export const getFieldRecordsCatalog = (ctx: ApiContext, body: FieldRecordCatalogInput, options?: RequestOptions): Promise<RecordsApiResult<FieldRecordCatalogData>> =>
  request<RecordsApiResult<FieldRecordCatalogData>>(ctx, E.getFieldRecordsCatalog, { body }, options);

/** Whether this app, at this version, may show Records at all in this department. `GET /FieldRecords/Preflight` — legacy: DIRU. */
export const getFieldRecordsPreflight = (
  ctx: ApiContext,
  params: { originClient?: number | string; appVersion?: string; clientCapability?: string } = {},
  options?: RequestOptions
): Promise<RecordsApiResult<FieldRecordPreflightData>> => request<RecordsApiResult<FieldRecordPreflightData>>(ctx, E.getFieldRecordsPreflight, { params }, options);

/** One record with its working details, participants, units, attachment metadata and revision summaries. Sets a weak ETag. `GET /Records/GetRecord` — legacy: DIRU. */
export const getRecord = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<RecordsApiResult<RecordData>> => request<RecordsApiResult<RecordData>>(ctx, E.getRecord, { params }, options);

/** `GET /Records/GetAttachments` — legacy: DIRU. */
export const getRecordAttachments = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<RecordAttachmentsResult> =>
  request<RecordAttachmentsResult>(ctx, E.getRecordAttachments, { params }, options);

/** `GET /RecordDefinitions/Version` — legacy: DIRU. */
export const getRecordDefinitionVersion = (ctx: ApiContext, params: { key?: string; version?: number | string } = {}, options?: RequestOptions): Promise<RecordsApiResult<RecordDefinitionVersionData>> =>
  request<RecordsApiResult<RecordDefinitionVersionData>>(ctx, E.getRecordDefinitionVersion, { params }, options);

/** `GET /RecordDeployments/Get` — legacy: DIRU. */
export const getRecordDeployment = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<RecordsApiResult<RecordDeploymentData>> =>
  request<RecordsApiResult<RecordDeploymentData>>(ctx, E.getRecordDeployment, { params }, options);

/** `GET /RecordDeploymentConnectors/Get` — legacy: DIRU. */
export const getRecordDeploymentConnector = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<RecordsApiResult<RecordDeploymentConnectorData>> =>
  request<RecordsApiResult<RecordDeploymentConnectorData>>(ctx, E.getRecordDeploymentConnector, { params }, options);

/** `GET /RecordDeploymentConnectors/Runs` — legacy: DIRU. */
export const getRecordDeploymentConnectorRuns = (ctx: ApiContext, params: { id: string; take?: number | string }, options?: RequestOptions): Promise<RecordsApiResult<RecordDeploymentConnectorRunData[]>> =>
  request<RecordsApiResult<RecordDeploymentConnectorRunData[]>>(ctx, E.getRecordDeploymentConnectorRuns, { params }, options);

/** `GET /RecordDeploymentConnectors/List` — legacy: DIRU. */
export const getRecordDeploymentConnectors = (ctx: ApiContext, options?: RequestOptions): Promise<RecordsApiResult<RecordDeploymentConnectorData[]>> =>
  request<RecordsApiResult<RecordDeploymentConnectorData[]>>(ctx, E.getRecordDeploymentConnectors, {}, options);

/** `GET /RecordDeploymentConnectors/Reconciliation` — legacy: DIRU. */
export const getRecordDeploymentReconciliation = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<RecordsApiResult<RecordDeploymentReconciliationData[]>> =>
  request<RecordsApiResult<RecordDeploymentReconciliationData[]>>(ctx, E.getRecordDeploymentReconciliation, { params }, options);

/** `GET /RecordDeployments/List` — legacy: DIRU. */
export const getRecordDeployments = (ctx: ApiContext, params: { includeClosed?: boolean; take?: number | string } = {}, options?: RequestOptions): Promise<RecordsApiResult<RecordDeploymentData[]>> =>
  request<RecordsApiResult<RecordDeploymentData[]>>(ctx, E.getRecordDeployments, { params }, options);

/** Session status, for resuming after a dropped connection. `GET /Records/GetUpload` — legacy: DIRU. */
export const getRecordUpload = (ctx: ApiContext, params: { uploadId: string }, options?: RequestOptions): Promise<RecordUploadResult> => request<RecordUploadResult>(ctx, E.getRecordUpload, { params }, options);

/** `POST /Records/RemoveAttachment` — legacy: DIRU. */
export const removeRecordAttachment = (ctx: ApiContext, body: RecordAttachmentIdInput, options?: RequestOptions): Promise<RecordsApiResult<unknown>> =>
  request<RecordsApiResult<unknown>>(ctx, E.removeRecordAttachment, { body }, options);

/** Safe rollout datapoints from this app (RMS plan RMS-1D): coded outcomes, counts and durations against the authenticated department and member. Nothing here carries record content, and a report that names an unknown event or a non-field origin is dropped rather than stored. `POST /FieldRecords/Telemetry` — legacy: DIRU. */
export const reportFieldRecordTelemetry = (ctx: ApiContext, body: FieldRecordTelemetryInput, options?: RequestOptions): Promise<FieldRecordTelemetryResult> =>
  request<FieldRecordTelemetryResult>(ctx, E.reportFieldRecordTelemetry, { body }, options);

/** `POST /RecordDeploymentConnectors/Run` — legacy: DIRU. */
export const runRecordDeploymentConnector = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<RecordDeploymentConnectorRunApiResult> =>
  request<RecordDeploymentConnectorRunApiResult>(ctx, E.runRecordDeploymentConnector, { params }, options);

/** ETag-guarded draft save; conflicts require deliberate reconciliation. `POST /Records/SaveDraft` — legacy: DIRU. */
export const saveRecordDraft = (ctx: ApiContext, body: SaveRecordDraftInput, options?: RequestOptions): Promise<RecordsApiResult<RecordData>> =>
  request<RecordsApiResult<RecordData>>(ctx, E.saveRecordDraft, { body }, options);

/** `POST /Records/SubmitForReview` — legacy: DIRU. */
export const submitRecordForReview = (ctx: ApiContext, body: RecordCommandInput, options?: RequestOptions): Promise<RecordsApiResult<RecordData>> =>
  request<RecordsApiResult<RecordData>>(ctx, E.submitRecordForReview, { body }, options);

/** The bounded working set: catalog, authorized change delta with tombstones, the caller's own drafts and returned Records, and their open assignments. A scope change answers ResetRequired instead of a page. `POST /FieldRecords/Sync` — legacy: DIRU. */
export const syncFieldRecords = (ctx: ApiContext, body: FieldRecordSyncInput, options?: RequestOptions): Promise<RecordsApiResult<FieldRecordSyncData>> =>
  request<RecordsApiResult<FieldRecordSyncData>>(ctx, E.syncFieldRecords, { body }, options);

/** One chunk at the session's next offset (base64, at most ChunkSize bytes). Returns ReceivedBytes to resume from. `POST /Records/UploadChunk` — legacy: DIRU. */
export const uploadRecordChunk = (ctx: ApiContext, body: RecordUploadChunkInput, options?: RequestOptions): Promise<RecordUploadResult> => request<RecordUploadResult>(ctx, E.uploadRecordChunk, { body }, options);
