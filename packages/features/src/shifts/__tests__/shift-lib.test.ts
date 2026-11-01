import { ShiftAssignmentType, ShiftDayMyStatus, ShiftRosterSource, ShiftTradeDirection, ShiftTradeStatus, ShiftTradeUserState } from '@resgrid/models';

import {
  canCancelTrade,
  canManageRosterEntry,
  canPickTrade,
  canRequestTradeForDay,
  canWithdrawFromDay,
  getIneligibleReasonKey,
  getShiftErrorKey,
  groupRoster,
  sectionMyShiftDays,
  sectionMyTrades,
  sectionOpenTrades,
  summarizeShiftDaysByDate,
  swapOptionsFor,
} from '../lib/shift-rules';
import { getDateKey, getMonthRange, isOvernightShift, mergeShiftDays, monthGrid, parseWallClock } from '../lib/shift-time';
import { shiftRoutes } from '../routes';
import { makeDay, makeTrade } from './fixtures';

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

  it('summarizes calendar days', () => {
    const summary = summarizeShiftDaysByDate([makeDay('1', { OpenSlots: 2 }), makeDay('2', { Filled: true, MyStatus: ShiftDayMyStatus.OnRoster })]).get('2030-05-10');
    expect(summary).toEqual({ count: 2, openSlots: 2, hasMine: true, allFilled: false });
  });
});

describe('shift routes', () => {
  it('builds safe links and refuses unsafe ids', () => {
    expect(shiftRoutes.list()).toBe('/shifts');
    expect(shiftRoutes.list('trades')).toBe('/shifts?view=trades');
    expect(shiftRoutes.day('42', { workshift: true })).toBe('/shifts/day/42?workshift=1');
    expect(shiftRoutes.trade('t 1')).toBe('/shifts/trade/t%201');
    expect(() => shiftRoutes.day('../x')).toThrow();
  });
});
