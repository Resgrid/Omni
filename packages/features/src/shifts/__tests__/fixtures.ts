// Shift test fixtures (not a test file).
import { useShiftsStore } from '@resgrid/data';
import {
  type PendingShiftSignupResultData,
  ShiftAssignmentType,
  ShiftDayMyStatus,
  type ShiftDayResultData,
  type ShiftResultData,
  ShiftTradeDirection,
  type ShiftTradeResultData,
  ShiftTradeStatus,
  ShiftTradeUserState,
} from '@resgrid/models';

export const makeDay = (ShiftDayId: string, overrides: Partial<ShiftDayResultData> = {}): ShiftDayResultData =>
  ({
    ShiftId: 's1',
    ShiftName: 'A Shift',
    ShiftDayId,
    ShiftDay: '2030-05-10T00:00:00',
    Start: '2030-05-10T07:00:00',
    End: '2030-05-10T19:00:00',
    SignedUp: false,
    ShiftType: ShiftAssignmentType.Signup,
    Color: '#ff0000',
    RequireApproval: false,
    Filled: false,
    OpenSlots: 2,
    IsActive: false,
    CanManage: false,
    CanSignup: false,
    MyStatus: ShiftDayMyStatus.None,
    MySignupId: '',
    MyGroupId: '',
    MyTradeId: '',
    Signups: [],
    Needs: [],
    Roster: [],
    ...overrides,
  }) as ShiftDayResultData;

export const makeShift = (ShiftId: string, overrides: Partial<ShiftResultData> = {}): ShiftResultData =>
  ({
    ShiftId,
    Name: `Shift ${ShiftId}`,
    Code: '',
    Color: '',
    ScheduleType: 0,
    AssignmentType: 0,
    InShift: false,
    PersonnelCount: 4,
    GroupCount: 1,
    NextDay: '',
    NextDayId: '',
    StartTime: '07:00',
    EndTime: '19:00',
    RequireApproval: false,
    CanManage: false,
    Groups: [],
    Days: [],
    ...overrides,
  }) as ShiftResultData;

export const makeTrade = (ShiftSignupTradeId: string, overrides: Partial<ShiftTradeResultData> = {}): ShiftTradeResultData =>
  ({
    ShiftSignupTradeId,
    Direction: ShiftTradeDirection.Incoming,
    Status: ShiftTradeStatus.Open,
    MyState: ShiftTradeUserState.Open,
    SourceShiftSignupId: 'src',
    SourceUserId: 'u-src',
    SourceUserName: 'Sam Source',
    ShiftId: 's1',
    ShiftName: 'A Shift',
    ShiftDayId: 'd-trade',
    ShiftDay: '2030-05-12T00:00:00',
    Start: '2030-05-12T07:00:00',
    End: '2030-05-12T19:00:00',
    GroupId: 'g1',
    GroupName: 'Station 1',
    Note: '',
    Users: [],
    AcceptedUserId: '',
    AcceptedUserName: '',
    TargetShiftSignupId: '',
    TargetShiftDay: '',
    ReviewNote: '',
    ReviewedByName: '',
    RequireApproval: false,
    CanReview: false,
    IsOpen: false,
    ShiftType: ShiftAssignmentType.Signup,
    ...overrides,
  }) as ShiftTradeResultData;

export const makeSignup = (ShiftSignupId: string, overrides: Partial<PendingShiftSignupResultData> = {}): PendingShiftSignupResultData =>
  ({
    ShiftSignupId,
    UserId: 'u2',
    UserName: 'Pat Lee',
    ShiftId: 's1',
    ShiftName: 'A Shift',
    ShiftDayId: 'd1',
    ShiftDay: '2030-05-10T00:00:00',
    Start: '2030-05-10T07:00:00',
    End: '2030-05-10T19:00:00',
    GroupId: 'g1',
    GroupName: 'Station 1',
    SignupTimestamp: '2030-05-01T10:00:00Z',
    Roles: ['EMT'],
    ...overrides,
  }) as PendingShiftSignupResultData;

export const okOutcome = (overrides: Partial<{ approvalPending: boolean; id: string }> = {}) => ({ success: true, errorCode: null, approvalPending: false, id: 'x', ...overrides });
export const failedOutcome = (errorCode: string) => ({ success: false, errorCode, approvalPending: false, id: '' }) as never;

/** Replaces every shift store fetch/mutation with a resolved mock; returns them for assertions. */
export const mockShiftActions = () => {
  const resolved = () => jest.fn(async () => undefined);
  const outcome = () => jest.fn(async () => okOutcome());
  const actions = {
    fetchAllShifts: resolved(),
    fetchTodaysShifts: resolved(),
    fetchMyShifts: resolved(),
    fetchShiftDaysForDateRange: resolved(),
    fetchSignupDays: resolved(),
    fetchWorkshiftDays: resolved(),
    fetchShiftTrades: resolved(),
    fetchOpenTrades: resolved(),
    fetchPendingApprovals: resolved(),
    fetchOnDutyPersonnel: resolved(),
    fetchShift: resolved(),
    fetchShiftDay: resolved(),
    fetchTradeDetail: resolved(),
    fetchTradeCandidates: resolved(),
    fetchPersonnelOptions: resolved(),
    signupForShift: outcome(),
    withdrawFromShift: outcome(),
    requestTrade: outcome(),
    respondToTrade: outcome(),
    finishTrade: outcome(),
    cancelTrade: outcome(),
    reviewSignup: outcome(),
    reviewTrade: outcome(),
    assignToShiftDay: outcome(),
    removeFromShiftDay: outcome(),
  };
  useShiftsStore.setState({
    shifts: [],
    todaysShiftDays: [],
    myShiftDays: [],
    calendarDays: [],
    calendarRange: null,
    signupDays: [],
    workshiftDays: { today: [], mine: [], calendar: [] },
    trades: [],
    openTrades: [],
    pendingApprovals: null,
    onDutyPersonnel: [],
    shiftsById: {},
    shiftDaysById: {},
    tradesById: {},
    tradeCandidatesByDay: {},
    personnelOptionsByDay: {},
    loading: {},
    errors: {},
    fetchedAt: {},
    ...actions,
  } as never);
  return actions;
};
