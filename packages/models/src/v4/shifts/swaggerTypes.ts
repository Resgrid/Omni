// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

/** Core `v4.Shifts.AssignToShiftDayInput` (generated from Swagger v4). */
export interface AssignToShiftDayInput {
  ShiftDayId?: number;
  UserId?: string | null;
  GroupId?: number;
}

/** Core `v4.Shifts.CancelShiftTradeInput` (generated from Swagger v4). */
export interface CancelShiftTradeInput {
  ShiftSignupTradeId?: number;
}

/** Core `v4.Shifts.FinishShiftTradeInput` (generated from Swagger v4). */
export interface FinishShiftTradeInput {
  ShiftSignupTradeId?: number;
  AcceptedUserId?: string | null;
  TargetShiftSignupId?: number | null;
}

/** Core `v4.Shifts.RemoveFromShiftDayInput` (generated from Swagger v4). */
export interface RemoveFromShiftDayInput {
  ShiftDayId?: number;
  UserId?: string | null;
  Note?: string | null;
}

/** Core `v4.Shifts.RequestShiftTradeInput` (generated from Swagger v4). */
export interface RequestShiftTradeInput {
  ShiftDayId?: number;
  UserIds?: string[] | null;
  Note?: string | null;
}

/** Core `v4.Shifts.RequestWorkshiftTradeInput` (generated from Swagger v4). */
export interface RequestWorkshiftTradeInput {
  WorkshiftDayId?: string | null;
  Note?: string | null;
}

/** Core `v4.Shifts.RespondToShiftTradeInput` (generated from Swagger v4). */
export interface RespondToShiftTradeInput {
  ShiftSignupTradeId?: number;
  Accept?: boolean;
  Note?: string | null;
  OfferedShiftSignupIds?: number[] | null;
}

/** Core `v4.Shifts.ReviewShiftSignupInput` (generated from Swagger v4). */
export interface ReviewShiftSignupInput {
  ShiftSignupId?: number;
  Approve?: boolean;
  Note?: string | null;
}

/** Core `v4.Shifts.ReviewShiftTradeInput` (generated from Swagger v4). */
export interface ReviewShiftTradeInput {
  ShiftSignupTradeId?: number;
  Approve?: boolean;
  Note?: string | null;
}

/** Core `v4.Shifts.WithdrawShiftSignupInput` (generated from Swagger v4). */
export interface WithdrawShiftSignupInput {
  ShiftSignupId?: number;
}
