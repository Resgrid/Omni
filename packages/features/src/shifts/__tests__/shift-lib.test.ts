import { getTimeZoneOffsetMinutes, zonedWallClockToUtc } from '@resgrid/core/utils/dates';
import { setDepartmentConfig } from '@resgrid/features/department-config';
import { type GetConfigResultData, ShiftAssignmentType, ShiftDayMyStatus, ShiftRosterSource, ShiftTradeDirection, ShiftTradeStatus, ShiftTradeUserState } from '@resgrid/models';

import { resolveShiftCalendarStart, toMonthParam } from '../lib/shift-loaders';
import {
  canApplyToTrade,
  canCancelTrade,
  canCancelTradeForDay,
  canManageRosterEntry,
  canManageShiftDay,
  canPickTrade,
  canRequestTradeForDay,
  canRespondToTrade,
  canReviewTrade,
  canSignupForDay,
  canWithdrawApplication,
  canWithdrawFromDay,
  getIneligibleReasonKey,
  getShiftDayOverAtMs,
  getShiftErrorKey,
  groupRoster,
  isPendingSignupOver,
  isShiftDayOver,
  isShiftTradeOver,
  sectionMyShiftDays,
  sectionMyTrades,
  sectionOpenTrades,
  summarizeShiftDaysByDate,
  swapOptionsFor,
} from '../lib/shift-rules';
import { getDateKey, getMonthRange, isOvernightShift, mergeShiftDays, monthGrid, parseWallClock, wallClockToUtcMs } from '../lib/shift-time';
import { shiftRoutes } from '../routes';
import { makeDay, makeSignup, makeTrade } from './fixtures';

const past = new Date(2020, 0, 1);

describe('shift time', () => {
  it('keeps wall-clock digits and drops a legacy offset', () => {
    const parsed = parseWallClock('2030-05-10T19:00:00Z');
    expect(parsed?.getHours()).toBe(19);
    expect(getDateKey('2030-05-10T19:00:00+05:00')).toBe('2030-05-10');
    expect(parseWallClock('')).toBeNull();
  });

  it('detects overnight shifts and builds month ranges and grids', () => {
    expect(isOvernightShift('2030-05-10T19:00:00', '2030-05-11T07:00:00')).toBe(true);
    expect(isOvernightShift('2030-05-10T07:00:00', '2030-05-10T19:00:00')).toBe(false);
    expect(getMonthRange(new Date(2030, 1, 14))).toEqual({ start: '2030-02-01', end: '2030-02-28' });
    const grid = monthGrid(new Date(2026, 1, 1)); // February 2026 starts on a Sunday.
    expect(grid.leadingBlanks).toBe(0);
    expect(grid.days).toHaveLength(28);
  });

  it('merges static shift days in start order without duplicates', () => {
    const merged = mergeShiftDays(
      [makeDay('1', { Start: '2030-05-10T07:00:00' })],
      [makeDay('w', { ShiftType: ShiftAssignmentType.Workshift, Start: '2030-05-10T06:00:00' }), makeDay('1', { Start: '2030-05-10T07:00:00' })]
    );

    expect(merged.map((day) => day.ShiftDayId)).toEqual(['w', '1']);
    expect(mergeShiftDays([makeDay('1')], [makeDay('1')]).length).toBe(1);
  });
});

describe('shift rules', () => {
  it('withdraw: own sign-ups can be withdrawn, standing slots and static shift days cannot', () => {
    const signedUp = makeDay('1', { MySignupId: 's1', MyStatus: ShiftDayMyStatus.OnRoster, Roster: [{ UserId: 'me', ShiftSignupId: 's1', Source: ShiftRosterSource.Signup } as never] });
    expect(canWithdrawFromDay(signedUp, 'me', past)).toBe(true);
    const standing = { ...signedUp, Roster: [{ UserId: 'me', ShiftSignupId: 's1', Source: ShiftRosterSource.Assigned } as never] };
    expect(canWithdrawFromDay(standing, 'me', past)).toBe(false);
    expect(canWithdrawFromDay({ ...signedUp, ShiftType: ShiftAssignmentType.Workshift }, 'me', past)).toBe(false);
    expect(canWithdrawFromDay(signedUp, 'me', new Date(2031, 0, 1))).toBe(false);
  });

  it('trade: on the roster, no open trade, and the server has the last word (CanTrade)', () => {
    const onRoster = makeDay('1', { MyStatus: ShiftDayMyStatus.OnRoster });
    expect(canRequestTradeForDay(onRoster, past)).toBe(true);
    expect(canRequestTradeForDay({ ...onRoster, MyTradeId: 't1' }, past)).toBe(false);
    expect(canRequestTradeForDay({ ...onRoster, CanTrade: false }, past)).toBe(false);
    expect(canRequestTradeForDay(makeDay('2'), past)).toBe(false);
  });

  it('maps server error codes to keys, unknown codes to the generic message', () => {
    expect(getShiftErrorKey('trade_exists')).toBe('shifts.errors.trade_exists');
    expect(getShiftErrorKey('Network')).toBe('shifts.errors.network');
    expect(getShiftErrorKey('ShiftFull')).toBe('shifts.errors.unknown');
    expect(getShiftErrorKey(null)).toBe('shifts.errors.unknown');
    expect(getIneligibleReasonKey('already_on_roster')).toBe('shifts.trade.ineligible.already_on_day');
    expect(getIneligibleReasonKey('')).toBeNull();
  });

  it('groups the roster by team (or by unit on static shift days) and checks who may manage an entry', () => {
    const roster = [{ UserId: 'a', GroupId: 'g1', GroupName: 'One', UnitId: 'u1', UnitName: 'E1' } as never, { UserId: 'b', GroupId: '', GroupName: '', UnitId: 'u1', UnitName: 'E1' } as never];
    expect(groupRoster(roster, 'No group', false).map((group) => group.name)).toEqual(['One', 'No group']);
    expect(groupRoster(roster, 'No group', true).map((group) => group.name)).toEqual(['E1']);
    const day = makeDay('1', { CanManage: true, Needs: [{ GroupId: 'g1', GroupName: 'One', GroupNeeds: [], CanManage: false }] });
    expect(canManageRosterEntry(day, { GroupId: 'g1' })).toBe(false);
    expect(canManageRosterEntry(day, { GroupId: '' })).toBe(true);
  });

  it('sections trades and my shift days in the order people act on them', () => {
    const answer = makeTrade('1');
    const outgoingOffer = makeTrade('2', { Direction: ShiftTradeDirection.Outgoing, Users: [{ UserId: 'x', Offered: true, Declined: false } as never] });
    const done = makeTrade('3', { Status: ShiftTradeStatus.Completed, MyState: ShiftTradeUserState.Accepted });
    expect(sectionMyTrades([done, answer, outgoingOffer]).map((section) => [section.key, section.items.map((trade) => trade.ShiftSignupTradeId)])).toEqual([
      ['attention', ['1', '2']],
      ['recent', ['3']],
    ]);
    expect(sectionOpenTrades([makeTrade('4', { IsOpen: true, CanApply: true }), makeTrade('5', { IsOpen: true, MyState: ShiftTradeUserState.Proposed })]).map((section) => section.key)).toEqual(['can-apply', 'applied']);
    expect(sectionMyShiftDays([makeDay('a', { IsActive: true }), makeDay('b', { MyStatus: ShiftDayMyStatus.PendingApproval }), makeDay('c')]).map((section) => section.key)).toEqual(['active', 'pending', 'upcoming']);
  });

  it('pick/cancel fall back to the requester on older servers; swap-back offers only approved own sign-ups', () => {
    const outgoing = makeTrade('1', { Direction: ShiftTradeDirection.Outgoing });
    expect(canPickTrade(outgoing)).toBe(true);
    expect(canPickTrade({ ...outgoing, CanPick: false })).toBe(false);
    expect(canCancelTrade(makeTrade('2'))).toBe(false);

    const mine = [
      makeDay('a', { MySignupId: 'sa', MyStatus: ShiftDayMyStatus.OnRoster }),
      makeDay('b', { MySignupId: 'sb', MyStatus: ShiftDayMyStatus.PendingApproval }),
      makeDay('d-trade', { MySignupId: 'sc', MyStatus: ShiftDayMyStatus.OnRoster }),
    ];

    expect(swapOptionsFor(makeTrade('3'), mine).map((day) => day.MySignupId)).toEqual(['sa']);
    expect(swapOptionsFor(makeTrade('4', { ShiftType: ShiftAssignmentType.Workshift }), mine)).toEqual([]);
  });

  it('a day is over at its UTC end when the server sends one (any device time zone), else at its wall-clock end', () => {
    const utc = makeDay('1', { End: '2030-05-10T19:00:00', EndUtc: '2030-05-10T23:00:00Z' });
    expect(getShiftDayOverAtMs(utc)).toBe(Date.UTC(2030, 4, 10, 23));
    expect(isShiftDayOver(utc, new Date(Date.UTC(2030, 4, 10, 22, 59)))).toBe(false);
    expect(isShiftDayOver(utc, new Date(Date.UTC(2030, 4, 10, 23)))).toBe(true);
    // A kept copy still flagged active is over once its UTC end has passed.
    expect(isShiftDayOver({ ...utc, IsActive: true }, new Date(Date.UTC(2030, 4, 11)))).toBe(true);
    // Older servers: no UTC end, so the wall-clock end is read in the department zone (the device's when none is known)
    // and an active day is not over: time alone never ends it, so nothing waits for it.
    const local = makeDay('2', { End: '2030-05-10T19:00:00' });
    expect(getShiftDayOverAtMs(local)).toBe(new Date(2030, 4, 10, 19).getTime());
    expect(isShiftDayOver(local, new Date(2030, 4, 10, 19))).toBe(true);
    expect(isShiftDayOver({ ...local, IsActive: true }, new Date(2030, 4, 10, 19))).toBe(false);
    expect(getShiftDayOverAtMs({ ...local, IsActive: true })).toBeNull();
    expect(getShiftDayOverAtMs(makeDay('3', { End: '' }))).toBeNull();
  });

  it('reads a wall-clock end in the department time zone, whatever zone the device is in', () => {
    // Tokyo is UTC+9 all year; Windows ids map to IANA; a legacy offset is dropped, never applied.
    expect(wallClockToUtcMs('2030-05-10T19:00:00', 'Asia/Tokyo')).toBe(Date.UTC(2030, 4, 10, 10));
    expect(wallClockToUtcMs('2030-05-10T19:00:00Z', 'Asia/Tokyo')).toBe(Date.UTC(2030, 4, 10, 10));
    expect(wallClockToUtcMs('2030-05-10T19:00:00', 'Central Standard Time')).toBe(Date.UTC(2030, 4, 11, 0));
    expect([wallClockToUtcMs('', 'Asia/Tokyo'), wallClockToUtcMs('not a date', 'Asia/Tokyo'), wallClockToUtcMs(null, null)]).toEqual([null, null, null]);

    // A department zone that differs from the test machine's, so a device-clock read would land on the wrong instant.
    const zone = getTimeZoneOffsetMinutes(new Date(Date.UTC(2030, 4, 10)), null) === 540 ? 'America/Chicago' : 'Asia/Tokyo';
    const endMs = zonedWallClockToUtc({ year: 2030, month: 5, day: 10, hour: 19, minute: 0, second: 0 }, zone).getTime();
    const before = new Date(endMs - 60_000);
    const at = new Date(endMs);
    const trade = makeTrade('1', { IsOpen: true, CanApply: true, End: '2030-05-10T19:00:00' });
    const signup = makeSignup('p1', { End: '2030-05-10T19:00:00' });
    expect([isShiftTradeOver(trade, before, zone), isShiftTradeOver(trade, at, zone)]).toEqual([false, true]);
    expect([isPendingSignupOver(signup, before, zone), isPendingSignupOver(signup, at, zone)]).toEqual([false, true]);
    expect([isShiftDayOver(makeDay('1'), before, zone), isShiftDayOver(makeDay('1'), at, zone)]).toEqual([false, true]);

    // The rules take the zone from the department config by default.
    // SAFETY: a test fixture; only the field the rules read is set.
    setDepartmentConfig({ TimeZoneId: zone } as GetConfigResultData);

    try {
      expect([canApplyToTrade(trade, before), canApplyToTrade(trade, at), isPendingSignupOver(signup, at)]).toEqual([true, false, true]);
      expect(getShiftDayOverAtMs(makeDay('1'))).toBe(endMs);
    } finally {
      setDepartmentConfig(null);
    }
  });

  it('a finished day takes no sign-up, trade, withdrawal or roster change', () => {
    const after = new Date(2031, 0, 1);
    const mine = { UserId: 'me', Name: 'Me', GroupId: '', GroupName: '', RoleIds: [], Roles: [], Source: ShiftRosterSource.Signup, ShiftSignupId: 's1', ApprovalPending: false, TradedFromUserId: '', TradedFromName: '' };
    const day = makeDay('1', { CanSignup: true, CanManage: true, MyTradeId: 't1', MySignupId: 's1', MyStatus: ShiftDayMyStatus.OnRoster, Roster: [mine] });
    expect([canSignupForDay(day, past), canManageShiftDay(day, past), canCancelTradeForDay(day, past)]).toEqual([true, true, true]);
    expect([canSignupForDay(day, after), canManageShiftDay(day, after), canCancelTradeForDay(day, after), canWithdrawFromDay(day, 'me', after)]).toEqual([false, false, false, false]);
    expect(canRequestTradeForDay({ ...day, MyTradeId: '' }, after)).toBe(false);
    // Static shift days are staffed from unit crews: never signed up for or managed here.
    const workshift = { ...day, ShiftType: ShiftAssignmentType.Workshift };
    expect([canSignupForDay(workshift, past), canManageShiftDay(workshift, past)]).toEqual([false, false]);
    expect(canSignupForDay({ ...day, CanSignup: false }, past)).toBe(false);
  });

  it('a trade or pending sign-up on a finished day offers no action, whatever the kept Can* flags say', () => {
    const after = new Date(2031, 0, 1);
    const open = makeTrade('1', { IsOpen: true, CanApply: true, CanReview: true, MyState: ShiftTradeUserState.Proposed });
    expect([canApplyToTrade(open, past), canReviewTrade(open, past), canWithdrawApplication(open, past)]).toEqual([true, true, true]);
    expect([isShiftTradeOver(open, after), canApplyToTrade(open, after), canReviewTrade(open, after), canWithdrawApplication(open, after)]).toEqual([true, false, false, false]);
    expect(canApplyToTrade({ ...open, IsOver: true }, past)).toBe(false);
    const targeted = makeTrade('2');
    expect([canRespondToTrade(targeted, past), canRespondToTrade(targeted, after)]).toEqual([true, false]);
    const outgoing = makeTrade('3', { Direction: ShiftTradeDirection.Outgoing });
    expect([canPickTrade(outgoing, past), canCancelTrade(outgoing, past)]).toEqual([true, true]);
    expect([canPickTrade(outgoing, after), canCancelTrade(outgoing, after)]).toEqual([false, false]);
    expect(sectionOpenTrades([{ ...open, IsOver: true }]).map((section) => section.key)).toEqual(['applied']);
    expect([isPendingSignupOver(makeSignup('p1'), past), isPendingSignupOver(makeSignup('p1'), after)]).toEqual([false, true]);
  });

  it('summarizes calendar days', () => {
    const summary = summarizeShiftDaysByDate([makeDay('1', { OpenSlots: 2 }), makeDay('2', { Filled: true, MyStatus: ShiftDayMyStatus.OnRoster })]).get('2030-05-10');
    expect(summary).toEqual({ count: 2, openSlots: 2, hasMine: true, allFilled: false });
  });
});

describe('calendar start', () => {
  const now = new Date(2026, 10, 8, 12);
  const last = { start: '2030-05-01', end: '2030-05-31', shiftId: 's1' };

  it('opens on the month and day in the route, keeping the last shift filter', () => {
    expect(resolveShiftCalendarStart({ month: '2030-06', date: '2030-06-14' }, last, now)).toEqual({ calendar: { range: { start: '2030-06-01', end: '2030-06-30' }, shiftId: 's1' }, selectedDate: '2030-06-14' });
    // A day alone names its month; a day outside the route's month is not picked.
    expect(resolveShiftCalendarStart({ date: '2030-07-04' }, null, now)).toEqual({ calendar: { range: { start: '2030-07-01', end: '2030-07-31' }, shiftId: null }, selectedDate: '2030-07-04' });
    expect(resolveShiftCalendarStart({ month: '2030-06', date: '2030-07-04' }, null, now).selectedDate).toBeNull();
  });

  it('falls back to the last loaded month, else this one, and picks today only inside it', () => {
    expect(resolveShiftCalendarStart({}, last, now)).toEqual({ calendar: { range: { start: '2030-05-01', end: '2030-05-31' }, shiftId: 's1' }, selectedDate: null });
    expect(resolveShiftCalendarStart({}, null, now)).toEqual({ calendar: { range: { start: '2026-11-01', end: '2026-11-30' }, shiftId: null }, selectedDate: '2026-11-08' });
    // Malformed or impossible params are ignored.
    expect(resolveShiftCalendarStart({ month: '2030-13', date: '2030-02-31' }, null, now).calendar.range.start).toBe('2026-11-01');
    expect(resolveShiftCalendarStart({ month: 'June', date: 'x' }, last, now).calendar.range.start).toBe('2030-05-01');
    expect(toMonthParam(new Date(2030, 5, 14))).toBe('2030-06');
  });
});

describe('shift routes', () => {
  it('builds safe links and refuses unsafe ids', () => {
    expect(shiftRoutes.list()).toBe('/shifts');
    expect(shiftRoutes.list('trades')).toBe('/shifts?view=trades');
    expect(shiftRoutes.day('42', { workshift: true })).toBe('/shifts/day/42?workshift=1');
    expect(shiftRoutes.trade('t 1')).toBe('/shifts/trade/t%201');
    expect(shiftRoutes.day('../x')).toBeNull();
  });
});
