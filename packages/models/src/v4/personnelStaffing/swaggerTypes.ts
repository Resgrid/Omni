// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Saves (sets) and Personnel Staffing in the system, for a single user */
export interface SavePersonnelStaffingInput {
  /** UnitId of the apparatus that the state is being set for */
  UserId: string;
  /** The UnitStateType of the Unit */
  Type: string;
  /** The timestamp of the status event in UTC */
  TimestampUtc?: string | null;
  /** The timestamp of the status event in the local time of the device */
  Timestamp?: string | null;
  /** User provided note for this event */
  Note?: string | null;
  /** The event id used for queuing on mobile applications */
  EventId?: string | null;
}

/** Saves (sets) and Personnel Status in the system, for a single user */
export interface SavePersonnelStaffingsInput {
  /** UnitId of the apparatus that the state is being set for */
  UserIds: string[];
  /** The UnitStateType of the Unit */
  Type: string;
  /** The timestamp of the status event in UTC */
  TimestampUtc?: string | null;
  /** The timestamp of the status event in the local time of the device */
  Timestamp?: string | null;
  /** User provided note for this event */
  Note?: string | null;
  /** The event id used for queuing on mobile applications */
  EventId?: string | null;
}
