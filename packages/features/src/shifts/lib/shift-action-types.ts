import type { PendingShiftSignupResultData, ShiftTradeOfferedShiftResultData, ShiftTradeResultData, ShiftTradeUserResultData } from '@resgrid/models';

/** Everything a trade card, the trade sheet or the approvals list can ask the confirmation sheet to do. */
export type ShiftTradeAction =
  | { kind: 'accept-trade'; trade: ShiftTradeResultData }
  | { kind: 'decline-trade'; trade: ShiftTradeResultData }
  | { kind: 'apply-trade'; trade: ShiftTradeResultData }
  | { kind: 'withdraw-application'; trade: ShiftTradeResultData }
  | { kind: 'cancel-trade'; trade: ShiftTradeResultData }
  | { kind: 'finish-trade'; trade: ShiftTradeResultData; user: ShiftTradeUserResultData; offeredShift: ShiftTradeOfferedShiftResultData | null }
  | { kind: 'review-trade'; trade: ShiftTradeResultData; approve: boolean };

/** A confirmation the Trades or Approvals view asks for before calling the server. */
export type ShiftSheetAction = ShiftTradeAction | { kind: 'review-signup'; signup: PendingShiftSignupResultData; approve: boolean };
