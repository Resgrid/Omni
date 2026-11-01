import * as api from '@resgrid/api';
import { ShiftAssignmentType, ShiftDayMyStatus, type ShiftDayResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, notFound, ok } from '../../__tests__/helpers';
import { isShiftSignupCandidate, SHIFT_SIGNUP_WINDOW_DAYS, useShiftsStore } from '../shifts-store';

jest.mock('@resgrid/api', () => {
  const actual = jest.requireActual('@resgrid/api');
  return { ...actual, getShiftDaysForDateRange: jest.fn(), getWorkshiftDays: jest.fn() };
});

const day = (ShiftDayId: string, overrides: Partial<ShiftDayResultData> = {}): ShiftDayResultData =>
  ({ ShiftDayId, ShiftId: 's1', ShiftName: 'A Shift', CanSignup: true, MyStatus: ShiftDayMyStatus.None, ShiftType: ShiftAssignmentType.Signup, ...overrides }) as ShiftDayResultData;

beforeEach(async () => {
  await createDataTestRuntime({ variant: 'responder' });
  await defaultResetRegistry.getStoreResets().get('data.shifts')?.('logout');
});

describe('shifts store: sign-up days', () => {
  it('loads the next 30 days and keeps only days the caller can still sign up for', async () => {
    jest
      .mocked(api.getShiftDaysForDateRange)
      .mockResolvedValue(ok([day('1'), day('2', { CanSignup: false }), day('3', { MyStatus: ShiftDayMyStatus.PendingApproval }), day('4', { ShiftType: ShiftAssignmentType.Workshift })]) as never);
    await useShiftsStore.getState().fetchSignupDays();
    expect(useShiftsStore.getState().signupDays.map((item) => item.ShiftDayId)).toEqual(['1']);
    // The test clock starts on 2026-10-31.
    expect(api.getShiftDaysForDateRange).toHaveBeenCalledWith(expect.anything(), { start: '2026-10-31', end: '2026-11-30' });
    expect(SHIFT_SIGNUP_WINDOW_DAYS).toBe(30);
  });

  it('isShiftSignupCandidate refuses static shift days and days the caller is already on', () => {
    expect(isShiftSignupCandidate(day('a'))).toBe(true);
    expect(isShiftSignupCandidate(day('b', { MyStatus: ShiftDayMyStatus.OnRoster }))).toBe(false);
    expect(isShiftSignupCandidate(day('c', { ShiftType: ShiftAssignmentType.Workshift }))).toBe(false);
  });
});

describe('shifts store: static shift (workshift) days', () => {
  it('keeps each list on its own and drops anything that is not a workshift day', async () => {
    jest.mocked(api.getWorkshiftDays).mockResolvedValueOnce(ok([day('w1', { ShiftType: ShiftAssignmentType.Workshift }), day('x')]) as never);
    await useShiftsStore.getState().fetchWorkshiftDays('today', { start: '2026-10-31', end: '2026-10-31' });
    jest.mocked(api.getWorkshiftDays).mockResolvedValueOnce(ok([day('w2', { ShiftType: ShiftAssignmentType.Workshift })]) as never);
    await useShiftsStore.getState().fetchWorkshiftDays('mine', { mine: true });

    const { workshiftDays } = useShiftsStore.getState();
    expect(workshiftDays.today.map((item) => item.ShiftDayId)).toEqual(['w1']);
    expect(workshiftDays.mine.map((item) => item.ShiftDayId)).toEqual(['w2']);
    expect(api.getWorkshiftDays).toHaveBeenNthCalledWith(1, expect.anything(), { start: '2026-10-31', end: '2026-10-31' });
    expect(api.getWorkshiftDays).toHaveBeenNthCalledWith(2, expect.anything(), { mine: true });
  });

  it('treats a server without static shifts (failure or not_found) as none, without an error', async () => {
    jest.mocked(api.getWorkshiftDays).mockRejectedValueOnce(new Error('404'));
    await useShiftsStore.getState().fetchWorkshiftDays('calendar', { start: '2026-11-01', end: '2026-11-30' });
    expect(useShiftsStore.getState().workshiftDays.calendar).toEqual([]);
    expect(useShiftsStore.getState().errors.workshiftsCalendar).toBeNull();

    jest.mocked(api.getWorkshiftDays).mockResolvedValueOnce(notFound(null) as never);
    await useShiftsStore.getState().fetchWorkshiftDays('mine', { mine: true });
    expect(useShiftsStore.getState().workshiftDays.mine).toEqual([]);
  });

  it('clears sign-up and static shift days on sign-out', async () => {
    jest.mocked(api.getWorkshiftDays).mockResolvedValueOnce(ok([day('w1', { ShiftType: ShiftAssignmentType.Workshift })]) as never);
    jest.mocked(api.getShiftDaysForDateRange).mockResolvedValueOnce(ok([day('1')]) as never);
    await useShiftsStore.getState().fetchWorkshiftDays('mine', { mine: true });
    await useShiftsStore.getState().fetchSignupDays();
    await defaultResetRegistry.getStoreResets().get('data.shifts')?.('logout');
    expect(useShiftsStore.getState().workshiftDays).toEqual({ today: [], mine: [], calendar: [] });
    expect(useShiftsStore.getState().signupDays).toEqual([]);
  });
});
