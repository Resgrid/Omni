// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Core `v4.CheckInTimers.PerformCheckInInput` (generated from Swagger v4). */
export interface PerformCheckInInput {
  CallId: number;
  CheckInType: number;
  /** Optional personnel user id when an incident commander checks in on that person's behalf. */
  UserId?: string | null;
  Latitude?: string | null;
  Longitude?: string | null;
  UnitId?: number | null;
  Note?: string | null;
  /** Optional offline idempotency key (the client's outbox event id); a replayed check-in dedups on it. */
  IdempotencyKey?: string | null;
}

/** Core `v4.CheckInTimers.ToggleCallTimersResult` (generated from Swagger v4). */
export interface ToggleCallTimersResult {
  Id?: string | null;
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
