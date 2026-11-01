// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

import type { UdfFieldValueInput } from '../userDefinedFields/udfFieldValueInput';
import type { NewCallFieldPolicyResultData } from './newCallFieldPolicyResultData';

/** Input information to close a call */
export interface CloseCallInput {
  /** Call Id of the call to close */
  Id: string;
  /** Message or notes of the call to close */
  Notes?: string | null;
  /** Type of call closure that is used */
  Type: number;
  /** Optional. When true, everyone attached to the call is told it was closed: the personnel, groups and roles it was dispatched to (Responder app, SMS, email per their notification settings), its units (Unit app) and the incident command team (IC app). The closing notes are not included in the notice. */
  SendNotification?: boolean | null;
}

/** Dispatches a pending call, or a scheduled call that has not gone out yet, right now */
export interface DispatchCallNowInput {
  /** Id of the call to dispatch */
  CallId: string;
  /** Optional. Pipe separated personnel ("P:"), groups ("G:"), roles ("R:") and units ("U:") to send the call to, replacing the call's current dispatch list; "0" sends it to everyone. Leave empty to use the dispatch list already on the call. */
  DispatchList?: string | null;
  /** Optional (conditional run cards). Pipe separated per-unit response codes, "unitId:codeId", from the department's response code catalog; "unitId:" clears a unit's code. Units not listed keep the code the run card proposed. */
  UnitResponseCodes?: string | null;
}

/** Data needed to create a new call */
export interface EditCallInput {
  /** Id of the call to update */
  Id: string;
  /** Priority of the call */
  Priority: number;
  /** Name of the call */
  Name: string;
  /** Nature of the call */
  Nature: string;
  /** Dispatch note */
  Note?: string | null;
  /** Address */
  Address?: string | null;
  /** Optional destination POI id for transfers, transports, and relocations. */
  DestinationPoiId?: number | null;
  /** Geolocation data "lat,lon" */
  Geolocation?: string | null;
  /** Type of the call */
  Type?: string | null;
  /** What 3 Words location */
  What3Words?: string | null;
  /** Comma seperated list of users,units,roles and groups to dipstach */
  DispatchList?: string | null;
  /** Optional (conditional run cards). Pipe separated per-unit response codes, "unitId:codeId", from the department's response code catalog; "unitId:" clears a unit's code. Units not listed keep the code the run card proposed. */
  UnitResponseCodes?: string | null;
  /** Contact Name */
  ContactName?: string | null;
  /** Contact Info */
  ContactInfo?: string | null;
  /** Id of the primary Contact (the premises/customer record) to link to the call. Optional; the contact must belong to the department. Contacts plan Phase A (A5). */
  ContactId?: string | null;
  /** Ids of additional Contacts to link to the call. Optional. On EditCall, supplying ContactId or AdditionalContactIds (even empty) replaces the call's existing contact links; omitting both leaves them unchanged. */
  AdditionalContactIds?: string[] | null;
  /** External Call Id */
  ExternalId?: string | null;
  /** External subject and record identifiers, for example { "ehr_client_id": "123456" }. Keys match ^[a-z0-9_]{1,64}$, values are at most 256 characters, at most 20 keys. Protected: encrypted at rest in an Advanced Data Protection department. On an edit, omit it (null) to leave the stored identifiers unchanged; an empty object clears them. */
  SubjectIdentifiers?: Record<string, unknown> | null;
  /** The department has 42 CFR Part 2 consent (or another Part 2 basis) on file for this call. On an edit, omit it to leave the stored value unchanged. */
  Part2ConsentOnFile?: boolean | null;
  /** Incident Id */
  IncidentId?: string | null;
  /** Reference Id */
  ReferenceId?: string | null;
  /** Optional. Indoor map zone the incident is in. Blank keeps the stored zone; leave it out (null) when the client has no indoor location picker, which also leaves the department's indoor location requirement unenforced. */
  IndoorMapZoneId?: string | null;
  /** Optional. Floor of Resgrid.Web.Services.Models.v4.Calls.EditCallInput.IndoorMapZoneId. */
  IndoorMapFloorId?: string | null;
  /** Optional. Ids of the department's dispatch protocols to add to the call; protocols already on it are kept. Leave it out (null) when the client has no protocol picker, which also leaves the protocols requirement unenforced. */
  ProtocolIds?: number[] | null;
  /** Optional. Id of another call in the department to link this call to; existing links are kept. Leave it out (null) when the client has no way to pick one, which also leaves the linked-call requirement unenforced. */
  LinkedCallId?: string | null;
  /** Time in the future, in the departments local time, to dispatch the call */
  DispatchOn?: string | null;
  /** Optional. The same as DispatchOn but in UTC (ISO 8601, e.g. "2026-10-07T14:30:00Z"), for clients that do not know the department's time zone. When both are sent this one is used. */
  DispatchOnUtc?: string | null;
  /** Call Intake form JSON */
  CallFormData?: string | null;
  /** Should all the entities attached to the call be re-notified */
  RebroadcastCall?: boolean;
  /** If true, entities removed from the dispatch list will receive a cancellation notification */
  NotifyCancelledEntities?: boolean;
  /** User Defined Field values for this call */
  UdfValues?: UdfFieldValueInput[] | null;
}

/** Outcome of a "Strike Next Alarm" escalation. */
export interface EscalateCallResult {
  /** Call identifier */
  Id?: string | null;
  /** False when no run card matched or the next alarm level adds nothing */
  Success?: boolean;
  /** Alarm level after the escalation; unchanged when Success is false */
  NewAlarmLevel?: number;
  /** Units added by this escalation */
  AddedUnits?: number;
  /** Personnel added by this escalation */
  AddedPersonnel?: number;
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

/** The department's new-call form policy: which built-in fields the call form shows, and which it requires before a call can be created. */
export interface NewCallFieldPolicyResult {
  Data?: NewCallFieldPolicyResultData;
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

/** Data needed to create a new call */
export interface NewCallInput {
  /** Priority of the call */
  Priority: number;
  /** Name of the call */
  Name: string;
  /** Nature of the call */
  Nature: string;
  /** Dispatch note */
  Note?: string | null;
  /** Address */
  Address?: string | null;
  /** Optional destination POI id for transfers, transports, and relocations. */
  DestinationPoiId?: number | null;
  /** Geolocation data "lat,lon" in decimal format */
  Geolocation?: string | null;
  /** Type of the call */
  Type?: string | null;
  /** What 3 Words location */
  What3Words?: string | null;
  /** Pipe separated string of users,units,roles and groups to dispatch. Users and Roles are prefixed with "P:" and "R:" respectively. Groups are prefixed with "G:" and Units are prefixed with "U:". */
  DispatchList?: string | null;
  /** Optional (conditional run cards). Pipe separated per-unit response codes, "unitId:codeId", from the department's response code catalog; "unitId:" clears a unit's code. Units not listed keep the code the run card proposed. */
  UnitResponseCodes?: string | null;
  /** Optional (conditional run cards). The run card outcome the dispatcher saw on the recommendation (Decision.OutcomeNodeKey), so the saved call keeps the proposal they reviewed instead of walking the graph again. */
  RunCardOutcomeNodeKey?: string | null;
  /** Contact Name */
  ContactName?: string | null;
  /** Contact Info (phone number, email, etc) */
  ContactInfo?: string | null;
  /** Id of the primary Contact (the premises/customer record) to link to the call. Optional; the contact must belong to the department. Contacts plan Phase A (A5). */
  ContactId?: string | null;
  /** Ids of additional Contacts to link to the call. Optional. On EditCall, supplying ContactId or AdditionalContactIds (even empty) replaces the call's existing contact links; omitting both leaves them unchanged. */
  AdditionalContactIds?: string[] | null;
  /** External Call Id */
  ExternalId?: string | null;
  /** External subject and record identifiers, for example { "ehr_client_id": "123456" }. Keys match ^[a-z0-9_]{1,64}$, values are at most 256 characters, at most 20 keys. Protected: encrypted at rest in an Advanced Data Protection department. On an edit, omit it (null) to leave the stored identifiers unchanged; an empty object clears them. */
  SubjectIdentifiers?: Record<string, unknown> | null;
  /** The department has 42 CFR Part 2 consent (or another Part 2 basis) on file for this call. On an edit, omit it to leave the stored value unchanged. */
  Part2ConsentOnFile?: boolean | null;
  /** Incident Id */
  IncidentId?: string | null;
  /** Reference Id */
  ReferenceId?: string | null;
  /** Optional. Id of an existing call in the department to link this call to (shown as a linked call on both). Leave it out (null) when the client has no way to pick one: the department's linked-call requirement is then not enforced; sent blank, it is. */
  LinkedCallId?: string | null;
  /** Optional. Ids of the department's dispatch protocols to attach to the call. Leave it out (null) when the client has no protocol picker: the department's protocols requirement is then not enforced; sent empty, it is. */
  ProtocolIds?: number[] | null;
  /** Time in the future, in the departments local time, to dispatch the call. Leave NULL to dispatch now. */
  DispatchOn?: string | null;
  /** Optional. The same as DispatchOn but in UTC (ISO 8601, e.g. "2026-10-07T14:30:00Z"), for integrations that keep times in UTC. When both are sent this one is used. Ignored for a pending call. */
  DispatchOnUtc?: string | null;
  /** Save the call as Pending (to be dispatched) instead of dispatching it: nobody is notified and the call stays out of the active call lists, maps and field apps until a dispatcher sends it with Calls/DispatchCallNow (or from the Pending Calls screens). DispatchOn is ignored. DispatchList is optional and is kept as the proposed dispatch; leave it empty for none, or "0" for everyone. The department's dispatch-list requirement does not apply to a pending call. Use this to feed calls in from another system for a dispatcher to work. */
  IsPending?: boolean | null;
  /** Call Intake form JSON */
  CallFormData?: string | null;
  /** User Defined Field values for this call */
  UdfValues?: UdfFieldValueInput[] | null;
  /** Indoor Map Zone Id for the call location */
  IndoorMapZoneId?: string | null;
  /** Indoor Map Floor Id for the call location */
  IndoorMapFloorId?: string | null;
  /** Enable check-in timers for this call. Leave null to use department default. */
  CheckInTimersEnabled?: boolean | null;
  /** Department Id for the call. Only used in System API Key (hosted multi-department) mode. When provided, overrides the department derived from the auth token. */
  DepartmentId?: string | null;
}

/** Input data needed to update a calls scheduled dispatch time */
export interface UpdateDispatchTimeInput {
  /** Id of the call to update */
  Id: string;
  /** Date in the future to update to */
  Date: string;
}
