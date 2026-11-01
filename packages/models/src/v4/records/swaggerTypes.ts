// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

import type { RecordDeploymentConnectorRunData } from './deployments';
import type { FieldRecordContextInput } from './records';

/** Open a resumable upload: declare size and SHA-256 up front (plan 5.3). */
export interface BeginRecordUploadInput {
  RecordId?: string | null;
  FileName?: string | null;
  ContentType?: string | null;
  ByteSize?: number;
  /** Lower-case hex SHA-256 of the whole file. */
  Sha256?: string | null;
}

/** Core `v4.Records.CompleteRecordUploadInput` (generated from Swagger v4). */
export interface CompleteRecordUploadInput {
  Classification?: number;
  UploadId?: string | null;
  Description?: string | null;
}

/** Core `v4.Records.FieldRecordAssignmentCommandInput` (generated from Swagger v4). */
export interface FieldRecordAssignmentCommandInput {
  AssignmentId?: string | null;
  RowVersion?: number | null;
  Reason?: string | null;
  Context?: FieldRecordContextInput;
  OriginClient?: number | null;
}

/** Core `v4.Records.FieldRecordPrefillInput` (generated from Swagger v4). */
export interface FieldRecordPrefillInput {
  DefinitionKey?: string | null;
  Version?: number;
  /** Resgrid.Model.RmsOriginClient: 2 Responder, 3 Unit, 4 IncidentCommand, 5 Dispatch. */
  OriginClient?: number | null;
  AppVersion?: string | null;
  /** records.v1 / records.v1b / records.v1c; an unknown value is treated as the oldest. */
  ClientCapability?: string | null;
  Context?: FieldRecordContextInput;
}

/** Core `v4.Records.FieldRecordSyncInput` (generated from Swagger v4). */
export interface FieldRecordSyncInput {
  Since?: number;
  SinceId?: string | null;
  ScopeStamp?: string | null;
  Take?: number;
  IncludeCatalog?: boolean;
  /** Resgrid.Model.RmsOriginClient: 2 Responder, 3 Unit, 4 IncidentCommand, 5 Dispatch. */
  OriginClient?: number | null;
  AppVersion?: string | null;
  /** records.v1 / records.v1b / records.v1c; an unknown value is treated as the oldest. */
  ClientCapability?: string | null;
  Context?: FieldRecordContextInput;
}

/** Core `v4.Records.FieldRecordTelemetryData` (generated from Swagger v4). */
export interface FieldRecordTelemetryData {
  /** How many events were kept after validation and truncation. */
  Accepted?: number;
}

/** Core `v4.Records.FieldRecordTelemetryEventInput` (generated from Swagger v4). */
export interface FieldRecordTelemetryEventInput {
  /** One of RmsFieldRolloutEventTypes; anything else is dropped rather than stored. */
  EventType?: string | null;
  /** "ok" or the coded refusal/conflict the client was given. */
  Outcome?: string | null;
  DefinitionKey?: string | null;
  DefinitionVersion?: number | null;
  RecordId?: string | null;
  DurationMs?: number | null;
  ItemCount?: number | null;
  OccurredOn?: string | null;
}

/** A batch of safe rollout datapoints from one app (RMS plan RMS-1D). Counts and codes only. */
export interface FieldRecordTelemetryInput {
  OriginClient?: number | null;
  AppVersion?: string | null;
  ClientCapability?: string | null;
  Events?: FieldRecordTelemetryEventInput[] | null;
}

/** Core `v4.Records.FieldRecordTelemetryResult` (generated from Swagger v4). */
export interface FieldRecordTelemetryResult {
  Data?: FieldRecordTelemetryData;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}

/** Core `v4.Records.RecordAttachmentData` (generated from Swagger v4). */
export interface RecordAttachmentData {
  Classification?: number | null;
  AttachmentId?: string | null;
  RecordId?: string | null;
  FileName?: string | null;
  ContentType?: string | null;
  ByteSize?: number;
  Checksum?: string | null;
  Description?: string | null;
  UploadedByUserId?: string | null;
  UploadedOn?: string;
  ScanState?: number;
  ScanStateName?: string | null;
  /** EXIF, XMP and IPTC were removed on upload; images are always re-encoded (RMS-1D media hygiene). */
  MetadataStripped?: boolean;
  /** The definition's profile asked for the photo's coordinates and they survived; false on everything else. */
  MediaLocationRetained?: boolean;
}

/** Core `v4.Records.RecordAttachmentIdInput` (generated from Swagger v4). */
export interface RecordAttachmentIdInput {
  RecordId?: string | null;
  AttachmentId?: string | null;
}

/** Core `v4.Records.RecordAttachmentsResult` (generated from Swagger v4). */
export interface RecordAttachmentsResult {
  Data?: RecordAttachmentData[] | null;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}

/** Core `v4.Records.RecordDeploymentConnectorRunApiResult` (generated from Swagger v4). */
export interface RecordDeploymentConnectorRunApiResult {
  Data?: RecordDeploymentConnectorRunData;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}

/** Core `v4.Records.RecordDetailsInput` (generated from Swagger v4). */
export interface RecordDetailsInput {
  Narrative?: string | null;
  InitialReport?: string | null;
  Type?: string | null;
  Course?: string | null;
  CourseCode?: string | null;
  Instructors?: string | null;
  Cause?: string | null;
  InvestigatedByUserId?: string | null;
  ContactName?: string | null;
  ContactNumber?: string | null;
  OtherPersonnel?: string | null;
  Location?: string | null;
  OtherAgencies?: string | null;
  OtherUnits?: string | null;
  BodyLocation?: string | null;
  PronouncedDeceasedBy?: string | null;
  CaseNumber?: string | null;
  Destination?: string | null;
  Facilitator?: string | null;
  UnitId?: number | null;
  ActivityOn?: string | null;
}

/** Core `v4.Records.RecordParticipantInputData` (generated from Swagger v4). */
export interface RecordParticipantInputData {
  UserId?: string | null;
  UnitId?: number | null;
  Role?: string | null;
}

/** Core `v4.Records.RecordUnitResponseInputData` (generated from Swagger v4). */
export interface RecordUnitResponseInputData {
  UnitId?: number;
  Dispatched?: string | null;
  Enroute?: string | null;
  OnScene?: string | null;
  Released?: string | null;
  InQuarters?: string | null;
}

/** Core `v4.Records.RecordUploadChunkInput` (generated from Swagger v4). */
export interface RecordUploadChunkInput {
  UploadId?: string | null;
  /** Byte offset of this chunk; must equal the session's ReceivedBytes. */
  Offset?: number;
  /** Base64 chunk, at most ChunkSize bytes. */
  Data?: string | null;
}

/** Core `v4.Records.RecordUploadData` (generated from Swagger v4). */
export interface RecordUploadData {
  UploadId?: string | null;
  RecordId?: string | null;
  FileName?: string | null;
  ContentType?: string | null;
  DeclaredSize?: number;
  /** Resume from here: the next chunk's Offset. */
  ReceivedBytes?: number;
  ChunkSize?: number;
  ChunkCount?: number;
  State?: number;
  StateName?: string | null;
  ExpiresOn?: string;
  AttachmentId?: string | null;
}

/** Core `v4.Records.RecordUploadIdInput` (generated from Swagger v4). */
export interface RecordUploadIdInput {
  UploadId?: string | null;
}

/** Core `v4.Records.RecordUploadResult` (generated from Swagger v4). */
export interface RecordUploadResult {
  Data?: RecordUploadData;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}

/** Core `v4.Records.RecordValueInputData` (generated from Swagger v4). */
export interface RecordValueInputData {
  SectionKey?: string | null;
  FieldKey?: string | null;
  RowKey?: string | null;
  Ordinal?: number;
  Value?: string | null;
  Values?: string[] | null;
  ReferenceType?: string | null;
  ReferenceId?: string | null;
  UnitCode?: string | null;
  CurrencyCode?: string | null;
  OffsetMinutes?: number | null;
}

/** Create or save a draft. Dates are UTC. Every list replaces the draft rows wholesale. */
export interface SaveRecordDraftInput {
  CustomFields?: Record<string, unknown>;
  /** Null on create. */
  RecordId?: string | null;
  /** Required on save (or send If-Match); the row version the client last saw. */
  RowVersion?: number | null;
  /** Scoped idempotency key for offline-created drafts: the same key returns the same record. */
  IdempotencyKey?: string | null;
  /** Client-generated GUID for an offline-created draft; server-assigned when null. */
  ClientRecordId?: string | null;
  DefinitionKey?: string | null;
  CallId?: number | null;
  StationGroupId?: number | null;
  ExternalId?: string | null;
  StartedOn?: string | null;
  EndedOn?: string | null;
  Details?: RecordDetailsInput;
  Participants?: RecordParticipantInputData[] | null;
  Units?: RecordUnitResponseInputData[] | null;
  /** Typed values for a department definition (RMS-1B); ignored for locked system definitions. A posted list replaces the stored values wholesale, so this stays null when the property is omitted: null is "no value update", an empty list is an explicit clear. Do not give it a default. */
  Values?: RecordValueInputData[] | null;
  DuplicateContinueReason?: string | null;
  /** RmsOriginClient: 2 Responder, 3 Unit, 4 IncidentCommand, 5 Dispatch, 6 Api (default). Field clients are gated by their Records.Field.* flag. */
  OriginClient?: number | null;
}
