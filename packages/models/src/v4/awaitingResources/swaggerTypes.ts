// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Dismisses an open requirement of a call. */
export interface DismissOutstandingRequirementInput {
  /** The call the requirement belongs to. */
  CallId: number;
  /** The requirement (CallOutstandingRequirementId). */
  RequirementId: number;
  /** Optional note saying why it is no longer needed. */
  Note?: string | null;
}

/** Dispatches a unit to a call awaiting resources in one step. */
export interface DispatchToAwaitingCallInput {
  /** The waiting call. */
  CallId: number;
  /** The unit to add to it. */
  UnitId: number;
}
