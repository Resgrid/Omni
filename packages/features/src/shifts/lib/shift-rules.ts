import {
  SHIFT_SERVER_ERROR_CODES,
  ShiftAssignmentType,
  type ShiftDayGroupNeedsResultData,
  ShiftDayMyStatus,
  type ShiftDayResultData,
  type ShiftDayRosterResultData,
  type ShiftErrorCode,
  ShiftRosterSource,
  ShiftScheduleType,
  ShiftTradeDirection,
  type ShiftTradeResultData,
  ShiftTradeStatus,
  ShiftTradeUserState,
} from '@resgrid/models';

import { getDateKey, parseWallClock } from './shift-time';

// Pure rules for the shift screens (Responder shift-labels + shift-utils). The server re-checks every action; these
// only decide which buttons show and how an outcome is worded.

export type BadgeAction = 'success' | 'warning' | 'error' | 'info' | 'muted';

export interface ShiftLabel {
  key: string;
  action: BadgeAction;
}

export const getAssignmentTypeKey = (assignmentType: number | undefined): string => {
  switch (assignmentType) {
    case ShiftAssignmentType.Assigned:
      return 'shifts.assignment_type.assigned';
    case ShiftAssignmentType.Signup:
      return 'shifts.assignment_type.signup';
    case ShiftAssignmentType.Workshift:
      return 'shifts.assignment_type.workshift';
    default:
      return 'shifts.unknown';
  }
};

export const getScheduleTypeKey = (scheduleType: number): string => {
  switch (scheduleType) {
    case ShiftScheduleType.Custom:
      return 'shifts.schedule_type.custom';
    case ShiftScheduleType.Manual:
      return 'shifts.schedule_type.manual';
    case ShiftScheduleType.TwentyFourFortyEight:
      return 'shifts.schedule_type.twenty_four_forty_eight';
    case ShiftScheduleType.TwentyFourSeventyTwo:
      return 'shifts.schedule_type.twenty_four_seventy_two';
    case ShiftScheduleType.FortyEightNinetySix:
      return 'shifts.schedule_type.forty_eight_ninety_six';
    default:
      return 'shifts.unknown';
  }
};

/** Source 0 covers the standing roster and a standing member's own per-day slot, so it reads as "Scheduled" either way. */
export const getRosterSourceLabel = (source: number): ShiftLabel => {
  switch (source) {
    case ShiftRosterSource.Signup:
      return { key: 'shifts.roster_source.signup', action: 'info' };
    case ShiftRosterSource.SupervisorAssigned:
      return { key: 'shifts.roster_source.supervisor', action: 'info' };
    case ShiftRosterSource.Trade:
      return { key: 'shifts.roster_source.trade', action: 'warning' };
    default:
      return { key: 'shifts.roster_source.scheduled', action: 'muted' };
  }
};

export const getMyStatusLabel = (myStatus: number): ShiftLabel | null => {
  switch (myStatus) {
    case ShiftDayMyStatus.OnRoster:
      return { key: 'shifts.status.on_roster', action: 'success' };
    case ShiftDayMyStatus.PendingApproval:
      return { key: 'shifts.status.pending_approval', action: 'warning' };
    case ShiftDayMyStatus.Denied:
      return { key: 'shifts.status.denied', action: 'error' };
    default:
      return null;
  }
};

export const getTradeStatusLabel = (status: number): ShiftLabel => {
  switch (status) {
    case ShiftTradeStatus.PendingApproval:
      return { key: 'shifts.trade.status.pending_approval', action: 'warning' };
    case ShiftTradeStatus.Completed:
      return { key: 'shifts.trade.status.completed', action: 'success' };
    case ShiftTradeStatus.Denied:
      return { key: 'shifts.trade.status.denied', action: 'error' };
    case ShiftTradeStatus.Cancelled:
      return { key: 'shifts.trade.status.cancelled', action: 'muted' };
    default:
      return { key: 'shifts.trade.status.open', action: 'info' };
  }
};

export const getTradeMyStateKey = (state: number): string => {
  switch (state) {
    case ShiftTradeUserState.Filled:
      return 'shifts.trade.my_state.filled';
    case ShiftTradeUserState.Declined:
      return 'shifts.trade.my_state.declined';
    case ShiftTradeUserState.Accepted:
      return 'shifts.trade.my_state.accepted';
    case ShiftTradeUserState.Proposed:
      return 'shifts.trade.my_state.proposed';
    case ShiftTradeUserState.PendingApproval:
      return 'shifts.trade.my_state.pending_approval';
    case ShiftTradeUserState.Denied:
      return 'shifts.trade.my_state.denied';
    default:
      return 'shifts.trade.my_state.open';
  }
};

/** Key for an applicant's eligibility problem (`IneligibleReason`), or null when they qualify. */
export const getIneligibleReasonKey = (reason: string | null | undefined): string | null => {
  if (!reason) return null;
  if (reason === 'already_on_roster') return 'shifts.trade.ineligible.already_on_day';
  if (reason === 'not_eligible') return 'shifts.trade.ineligible.missing_roles';
  return 'shifts.trade.ineligible.not_allowed';
};

const KNOWN_ERROR_CODES = new Set<string>([...SHIFT_SERVER_ERROR_CODES, 'network', 'unknown']);

/** Translation key for a mutation outcome code; anything unrecognised reads as the generic message. */
export const getShiftErrorKey = (code: ShiftErrorCode | string | null | undefined): string => {
  const normalized = typeof code === 'string' ? code.trim().toLowerCase() : '';
  return KNOWN_ERROR_CODES.has(normalized) ? `shifts.errors.${normalized}` : 'shifts.errors.unknown';
};

/** The day has finished (device clock against the department wall-clock end). */
export const isShiftDayOver = (day: Pick<ShiftDayResultData, 'End' | 'IsActive'>, now: Date = new Date()): boolean => {
  if (day.IsActive) return false;
  const end = parseWallClock(day.End);
  return end !== null && end.getTime() <= now.getTime();
};

/** The caller's own roster entry for the day, when the full day (with Roster) is loaded. */
export const findMyRosterEntry = (day: ShiftDayResultData, userId: string | null | undefined): ShiftDayRosterResultData | undefined => {
  if (!userId) return undefined;
  return (day.Roster ?? []).find((entry) => entry.UserId === userId && (!day.MySignupId || entry.ShiftSignupId === day.MySignupId || entry.ShiftSignupId === ''));
};

/** A sign-up the caller holds can be withdrawn; a standing-roster slot (source 0) is traded, not withdrawn. Static shift days never. */
export const canWithdrawFromDay = (day: ShiftDayResultData, userId: string | null | undefined, now: Date = new Date()): boolean => {
  if (day.ShiftType === ShiftAssignmentType.Workshift) return false;
  if (!day.MySignupId || (day.MyStatus !== ShiftDayMyStatus.OnRoster && day.MyStatus !== ShiftDayMyStatus.PendingApproval) || isShiftDayOver(day, now)) return false;
  const entry = findMyRosterEntry(day, userId);
  if (entry) return entry.Source === ShiftRosterSource.Signup || entry.Source === ShiftRosterSource.SupervisorAssigned || entry.Source === ShiftRosterSource.Trade;
  return day.ShiftType === ShiftAssignmentType.Signup;
};

/** On the roster (approved), no trade open, not over. Newer servers decide it (`CanTrade`); older ones leave it to this check. */
export const canRequestTradeForDay = (day: ShiftDayResultData, now: Date = new Date()): boolean => {
  if (day.MyStatus !== ShiftDayMyStatus.OnRoster || !!day.MyTradeId || isShiftDayOver(day, now)) return false;
  return day.CanTrade ?? true;
};

export const getGroupOpenSlots = (group: ShiftDayGroupNeedsResultData): number => (group.GroupNeeds ?? []).reduce((total, role) => total + Math.max(0, role.Needed || 0), 0);

/** Groups a supervisor may manage on this day. */
export const getManageableGroups = (day: ShiftDayResultData): ShiftDayGroupNeedsResultData[] => (day.Needs ?? []).filter((group) => group.CanManage);

/** By the entry's group when it has one, otherwise by the day-level flag. */
export const canManageRosterEntry = (day: ShiftDayResultData, entry: Pick<ShiftDayRosterResultData, 'GroupId'>): boolean => {
  if (!entry.GroupId) return day.CanManage;
  return (day.Needs ?? []).some((group) => group.GroupId === entry.GroupId && group.CanManage);
};

export interface RosterGroup {
  key: string;
  name: string;
  entries: ShiftDayRosterResultData[];
}

/** Shift days group their roster by team; static shift days by the unit each person crews. */
export const groupRoster = (roster: readonly ShiftDayRosterResultData[], noGroupLabel: string, byUnit: boolean): RosterGroup[] => {
  const groups = new Map<string, RosterGroup>();
  roster.forEach((entry) => {
    const key = (byUnit ? entry.UnitId : entry.GroupId) || '';
    const name = (byUnit ? entry.UnitName : entry.GroupName) || noGroupLabel;
    const existing = groups.get(key) ?? { key, name, entries: [] };
    existing.entries.push(entry);
    groups.set(key, existing);
  });
  return Array.from(groups.values());
};

// ── Trades ─────────────────────────────────────────────────────────

/** Whether the caller may pick between offers: the server decides on newer servers; before that only the requester could. */
export const canPickTrade = (trade: ShiftTradeResultData): boolean => trade.CanPick ?? (trade.Direction === ShiftTradeDirection.Outgoing && trade.Status === ShiftTradeStatus.Open);

export const canCancelTrade = (trade: ShiftTradeResultData): boolean =>
  trade.CanCancel ?? (trade.Direction === ShiftTradeDirection.Outgoing && (trade.Status === ShiftTradeStatus.Open || trade.Status === ShiftTradeStatus.PendingApproval));

/** The caller applied to an open request and can still take the offer back. */
export const canWithdrawApplication = (trade: ShiftTradeResultData): boolean => !!trade.IsOpen && trade.Status === ShiftTradeStatus.Open && trade.MyState === ShiftTradeUserState.Proposed && !trade.IsOver;

/** A targeted request the caller was asked to take and has not answered. */
export const canRespondToTrade = (trade: ShiftTradeResultData): boolean =>
  !trade.IsOpen && trade.Direction === ShiftTradeDirection.Incoming && trade.Status === ShiftTradeStatus.Open && trade.MyState === ShiftTradeUserState.Open;

/** Trades that need something from the caller: an answer, a pick, or a review. */
export const tradeNeedsAttention = (trade: ShiftTradeResultData): boolean => {
  if (trade.CanReview) return true;
  if (trade.Status !== ShiftTradeStatus.Open) return false;
  if (canRespondToTrade(trade)) return true;
  return canPickTrade(trade) && (trade.Users ?? []).some((user) => user.Offered && !user.Declined);
};

export const isActiveTrade = (trade: ShiftTradeResultData): boolean => trade.Status === ShiftTradeStatus.Open || trade.Status === ShiftTradeStatus.PendingApproval;

export interface Section<T> {
  key: string;
  titleKey: string;
  items: T[];
}

const nonEmpty = <T>(sections: Section<T>[]): Section<T>[] => sections.filter((section) => section.items.length > 0);

/** The caller's own trades: needs attention, in progress, recent. */
export const sectionMyTrades = (trades: readonly ShiftTradeResultData[]): Section<ShiftTradeResultData>[] => {
  const attention = trades.filter(tradeNeedsAttention);
  const rest = trades.filter((trade) => !tradeNeedsAttention(trade));
  return nonEmpty([
    { key: 'attention', titleKey: 'shifts.trade.section_attention', items: attention },
    { key: 'active', titleKey: 'shifts.trade.section_active', items: rest.filter(isActiveTrade) },
    { key: 'recent', titleKey: 'shifts.trade.section_recent', items: rest.filter((trade) => !isActiveTrade(trade)) },
  ]);
};

/** Open requests in the department: what the caller can take, what they applied to, everything else. */
export const sectionOpenTrades = (trades: readonly ShiftTradeResultData[]): Section<ShiftTradeResultData>[] =>
  nonEmpty([
    { key: 'can-apply', titleKey: 'shifts.trade.section_can_apply', items: trades.filter((trade) => trade.CanApply) },
    { key: 'applied', titleKey: 'shifts.trade.section_applied', items: trades.filter((trade) => !trade.CanApply && trade.MyState === ShiftTradeUserState.Proposed) },
    { key: 'others', titleKey: 'shifts.trade.section_other_requests', items: trades.filter((trade) => !trade.CanApply && trade.MyState !== ShiftTradeUserState.Proposed) },
  ]);

/** My Shifts in the order someone checks them: on now, waiting on a supervisor, then upcoming. */
export const sectionMyShiftDays = (days: readonly ShiftDayResultData[]): Section<ShiftDayResultData>[] =>
  nonEmpty([
    { key: 'active', titleKey: 'shifts.mine_sections.active', items: days.filter((day) => day.IsActive) },
    { key: 'pending', titleKey: 'shifts.mine_sections.pending', items: days.filter((day) => !day.IsActive && day.MyStatus === ShiftDayMyStatus.PendingApproval) },
    { key: 'upcoming', titleKey: 'shifts.mine_sections.upcoming', items: days.filter((day) => !day.IsActive && day.MyStatus !== ShiftDayMyStatus.PendingApproval) },
  ]);

/** Approved, upcoming sign-ups the caller can offer back when accepting or applying to a trade (not static shift days). */
export const swapOptionsFor = (trade: ShiftTradeResultData, myDays: readonly ShiftDayResultData[]): ShiftDayResultData[] =>
  trade.ShiftType === ShiftAssignmentType.Workshift
    ? []
    : myDays.filter((day) => !!day.MySignupId && day.MyStatus === ShiftDayMyStatus.OnRoster && !day.MyTradeId && day.ShiftDayId !== trade.ShiftDayId && day.ShiftType !== ShiftAssignmentType.Workshift);

// ── Calendar ───────────────────────────────────────────────────────

export interface DaySummary {
  count: number;
  openSlots: number;
  hasMine: boolean;
  allFilled: boolean;
}

export const summarizeShiftDaysByDate = (days: readonly ShiftDayResultData[]): Map<string, DaySummary> => {
  const map = new Map<string, DaySummary>();
  days.forEach((day) => {
    const key = getDateKey(day.ShiftDay || day.Start);
    if (!key) return;
    const summary = map.get(key) ?? { count: 0, openSlots: 0, hasMine: false, allFilled: true };
    summary.count += 1;
    summary.openSlots += day.Filled ? 0 : Math.max(0, day.OpenSlots || 0);
    summary.hasMine = summary.hasMine || day.MyStatus === ShiftDayMyStatus.OnRoster || day.MyStatus === ShiftDayMyStatus.PendingApproval;
    summary.allFilled = summary.allFilled && day.Filled;
    map.set(key, summary);
  });
  return map;
};

/** Case-insensitive match on the shift name (the list search). */
export const matchesShiftQuery = (day: Pick<ShiftDayResultData, 'ShiftName'>, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  return needle === '' || (day.ShiftName ?? '').toLowerCase().includes(needle);
};
