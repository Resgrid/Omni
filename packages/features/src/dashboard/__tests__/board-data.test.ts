import './test-setup';

import type {
  CallPriorityResultData,
  CallResultData,
  DispatchedEventResultData,
  MapMakerInfoData,
  NoteResultData,
  PersonnelInfoResultData,
  StatusesResultData,
  UnitStatusAlertAcknowledgementResultData,
} from '@resgrid/models';

import {
  comparePriorityUrgency,
  countByOption,
  minutesUntilActive,
  mostRecentCall,
  scheduledUrgencyColor,
  selectNotes,
  selectPersonnelRows,
  selectScheduledCalls,
  summarizeCallPriorities,
  summarizeUnits,
} from '../lib/board-data';
import { elapsedSince, elapsedSinceLocal, formatClock, formatElapsed, normalizeColor } from '../lib/format';
import { filterMapPins, resolveWidgetCenter } from '../lib/map-pins';
import {
  acknowledgedSortWeight,
  annotateUnit,
  type BoardUnit,
  canAcknowledgeUnit,
  compareAnnotatedUnits,
  countUnitsWithoutMeaning,
  evaluateUnitStatusAlert,
  requiresAcknowledgementNote,
  resolveAcknowledgement,
} from '../lib/unit-status-alerts';
import { defaultWidgetSettings } from '../lib/widget-settings';

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const ago = (seconds: number): string => new Date(NOW - seconds * 1000).toISOString().replace('Z', '');

const person = (UserId: string, extra: Partial<PersonnelInfoResultData> = {}): PersonnelInfoResultData => ({ UserId, FirstName: UserId, LastName: 'X', GroupId: '', Roles: [], ...extra }) as PersonnelInfoResultData;
const option = (Id: number, Text: string, BaseType: number): StatusesResultData => ({ Id, Text, BaseType, BColor: '#123456' }) as StatusesResultData;
const unit = (UnitId: string, extra: Partial<BoardUnit> = {}): BoardUnit => ({ UnitId, Name: UnitId, GroupId: '', ...extra }) as BoardUnit;
const priority = (Id: number, Name: string, BaseType: number | null, Sort = 0): CallPriorityResultData => ({ Id, Name, BaseType, Sort, Color: '#ff0000', IsDeleted: false }) as CallPriorityResultData;
const call = (CallId: string, extra: Partial<CallResultData> = {}): CallResultData => ({ CallId, Name: CallId, Priority: 0, State: 0, ...extra }) as CallResultData;

describe('personnel rows (by meaning, never by name)', () => {
  const rows = [
    person('a', { StatusBaseType: 0, Status: 'In Quarters' }),
    person('b', { StatusBaseType: 2, Status: 'Wheels Rolling' }),
    person('c', { StatusBaseType: 1, Status: 'Responding' }),
    person('d', { StaffingBaseType: 5, GroupId: '7' }),
    person('e', { StatusBaseType: 6 }),
  ];

  it('hides not-responding people and unavailable/off-duty staffing by base type', () => {
    const settings = { ...defaultWidgetSettings().personnel, sortRespondingToTop: false, hideNotResponding: true, hideUnavailable: true };
    expect(selectPersonnelRows(rows, settings).map((row) => row.UserId)).toEqual(['a', 'b', 'e']);
  });

  it('floats responding people to the top (stable) and hides groups', () => {
    const settings = { ...defaultWidgetSettings().personnel, sortRespondingToTop: true, hideGroups: ['7'] };
    expect(selectPersonnelRows(rows, settings).map((row) => row.UserId)).toEqual(['b', 'e', 'a', 'c']);
  });

  it('counts people per option by id first, then by meaning', () => {
    const options = [option(10, 'Available', 0), option(11, 'Responding', 2), option(12, 'On Scene', 3)];
    const people = [person('1', { StatusId: '10' }), person('2', { StatusId: '999', StatusBaseType: 2 }), person('3', { StatusId: '', StatusBaseType: 3 }), person('4', { StatusId: '', StatusBaseType: 9 })];
    expect(countByOption(people, options, 'status').map((entry) => entry.count)).toEqual([1, 1, 1]);
    expect(countByOption([person('5', { StaffingId: '10' })], options, 'staffing')[0]?.count).toBe(1);
  });
});

describe('units and calls summaries', () => {
  it('counts units by status meaning', () => {
    const summary = summarizeUnits([
      unit('1', { CurrentStatusBaseType: 23 }),
      unit('2', { CurrentStatusBaseType: 6 }),
      unit('3', { CurrentStatusBaseType: 9 }),
      unit('4', { CurrentStatusBaseType: 12 }),
      unit('5', { CurrentStatusBaseType: 3 }),
      unit('6', { CurrentStatusBaseType: -1 }),
      unit('7'),
    ]);
    expect(summary).toEqual({ total: 7, available: 1, responding: 2, onScene: 2 });
  });

  it('orders priorities by meaning, then sort; falls back to built-in ids', () => {
    const byId = new Map([priority(5, 'Routine', 0, 1), priority(6, 'Code 3', 3, 2), priority(7, 'Urgent', 2, 0)].map((entry) => [entry.Id, entry]));
    expect([5, 6, 7].sort((a, b) => comparePriorityUrgency(a, b, byId))).toEqual([6, 7, 5]);
    expect([0, 3, 1].sort((a, b) => comparePriorityUrgency(a, b, new Map()))).toEqual([3, 1, 0]);
  });

  it('counts active calls per priority id, honouring picks and limits', () => {
    const priorities = [priority(1, 'Low', 0, 2), priority(2, 'High', 2, 1), { ...priority(3, 'Old', 1), IsDeleted: true }];
    const calls = [call('a', { Priority: 1 }), call('b', { Priority: 2 }), call('c', { Priority: 2 })];
    expect(summarizeCallPriorities(calls, priorities, { priorityIds: [], maxPrioritiesToShow: 0 }).map((row) => [row.priority.Id, row.count])).toEqual([
      [2, 2],
      [1, 1],
    ]);
    expect(summarizeCallPriorities(calls, priorities, { priorityIds: [1, 3], maxPrioritiesToShow: 0 }).map((row) => row.priority.Id)).toEqual([1]);
    expect(summarizeCallPriorities(calls, priorities, { priorityIds: [], maxPrioritiesToShow: 1 })).toHaveLength(1);
  });

  it('finds the most recently logged call with the UTC parser', () => {
    expect(mostRecentCall([call('old', { LoggedOnUtc: ago(600) }), call('new', { LoggedOnUtc: ago(60) }), call('bad', { LoggedOnUtc: '' })])?.CallId).toBe('new');
    expect(mostRecentCall([])).toBeNull();
  });
});

describe('scheduled calls', () => {
  const dispatch = (Type: string, Id: string, GroupId = ''): DispatchedEventResultData => ({ Type, Id, GroupId, Name: Id }) as DispatchedEventResultData;
  const calls = [
    call('soon', { Name: 'B', DispatchedOnUtc: new Date(NOW + 10 * 60000).toISOString(), Priority: 1 }),
    call('later', { Name: 'A', DispatchedOnUtc: new Date(NOW + 300 * 60000).toISOString(), Priority: 3 }),
    call('mid', { Name: 'C', ScheduledOnUtc: new Date(NOW + 90 * 60000).toISOString(), Priority: 0 }),
  ];
  const dispatches = { soon: [dispatch('Unit', '7')], later: [dispatch('Group', '3'), dispatch('Personnel', 'u1')], mid: [dispatch('Unit', '8', '3')] };
  const settings = defaultWidgetSettings().scheduledCalls;

  it('sorts by time, priority meaning or name', () => {
    expect(selectScheduledCalls(calls, dispatches, new Map(), settings).map((entry) => entry.CallId)).toEqual(['soon', 'mid', 'later']);
    expect(selectScheduledCalls(calls, dispatches, new Map(), { ...settings, sortBy: 'priority', sortOrder: 'desc' }).map((entry) => entry.CallId)).toEqual(['later', 'soon', 'mid']);
    expect(selectScheduledCalls(calls, dispatches, new Map(), { ...settings, sortBy: 'name' }).map((entry) => entry.CallId)).toEqual(['later', 'soon', 'mid']);
  });

  it('filters by who a call pages (every active filter kind must match)', () => {
    expect(selectScheduledCalls(calls, dispatches, new Map(), { ...settings, filterUnitIds: ['7'] }).map((entry) => entry.CallId)).toEqual(['soon']);
    expect(selectScheduledCalls(calls, dispatches, new Map(), { ...settings, filterGroupIds: ['3'] }).map((entry) => entry.CallId)).toEqual(['later']);
    expect(selectScheduledCalls(calls, dispatches, new Map(), { ...settings, filterGroupIds: ['3'], filterPersonnelIds: ['u1'] }).map((entry) => entry.CallId)).toEqual(['later']);
    expect(selectScheduledCalls(calls, {}, new Map(), { ...settings, filterRoleIds: ['r'] })).toEqual([]);
  });

  it('colour-codes by minutes until active', () => {
    expect(minutesUntilActive(calls[0] as CallResultData, NOW)).toBeCloseTo(10);
    expect(scheduledUrgencyColor(10, settings)).toBe(settings.colorRedHex);
    expect(scheduledUrgencyColor(45, settings)).toBe(settings.colorYellowHex);
    expect(scheduledUrgencyColor(200, settings)).toBe(settings.colorGreenHex);
    expect(scheduledUrgencyColor(5000, settings)).toBe(settings.colorDefaultHex);
    expect(scheduledUrgencyColor(-5, settings)).toBe(settings.colorRedHex);
    expect(scheduledUrgencyColor(null, settings)).toBe(settings.colorDefaultHex);
  });
});

describe('notes and map pins', () => {
  const note = (NoteId: string, extra: Partial<NoteResultData> = {}): NoteResultData => ({ NoteId, Title: NoteId, Body: '', Category: '', ExpiresOn: '', AddedOn: '2026-10-01T10:00:00', ...extra }) as NoteResultData;

  it('keeps unexpired notes in the chosen category, newest first', () => {
    const notes = [note('expired', { ExpiresOn: '2020-01-01T00:00:00' }), note('ops', { Category: 'Ops', AddedOn: '2026-10-02T10:00:00' }), note('plain'), note('hr', { Category: 'HR' })];
    expect(selectNotes(notes, { category: '', includeUncategorized: true }, NOW).map((entry) => entry.NoteId)).toEqual(['ops', 'plain', 'hr']);
    expect(selectNotes(notes, { category: 'ops', includeUncategorized: true }, NOW).map((entry) => entry.NoteId)).toEqual(['ops', 'plain']);
    expect(selectNotes(notes, { category: 'Ops', includeUncategorized: false }, NOW).map((entry) => entry.NoteId)).toEqual(['ops']);
  });

  it('drops the pin kinds the board turned off and pins without a position', () => {
    const pin = (Id: string, Type: number, Latitude = 1, Longitude = 1): MapMakerInfoData => ({ Id, Type, Latitude, Longitude }) as MapMakerInfoData;
    const pins = [pin('c1', 0), pin('u1', 1), pin('s1', 2), pin('p1', 3), pin('poi', 4), pin('nowhere', 0, 0, 0)];
    expect(filterMapPins(pins, { showCalls: true, showUnits: false, showStations: true, showPersonnel: false }).map((entry) => entry.Id)).toEqual(['c1', 's1', 'poi']);
  });

  it('centres on the widget, else the department, else nothing', () => {
    expect(resolveWidgetCenter({ latitude: 40, longitude: -105 }, null)).toEqual([-105, 40]);
    expect(resolveWidgetCenter({ latitude: 0, longitude: 0 }, { latitude: '39.5', longitude: '-104.5' })).toEqual([-104.5, 39.5]);
    expect(resolveWidgetCenter({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 })).toBeNull();
  });
});

describe('format helpers', () => {
  it('formats elapsed time, ages and colours', () => {
    expect(formatElapsed(45)).toBe('45s');
    expect(formatElapsed(4 * 60)).toBe('4m');
    expect(formatElapsed(72 * 60)).toBe('1h 12m');
    expect(formatElapsed(null)).toBe('');
    // Zone-less UTC values are UTC (shared parser), not device-local.
    expect(elapsedSince(ago(5 * 60), NOW)).toEqual({ unit: 'minutes', count: 5 });
    expect(elapsedSince(ago(3 * 3600), NOW)).toEqual({ unit: 'hours', count: 3 });
    expect(elapsedSince('garbage', NOW)).toBeNull();
    const local = new Date(NOW - 2 * 86400000);
    expect(elapsedSinceLocal(`${local.getFullYear()}-${local.getMonth() + 1}-${local.getDate()}T${local.getHours()}:${local.getMinutes()}:00`, NOW)).toEqual({ unit: 'days', count: 2 });
    expect(normalizeColor('5CB85C')).toBe('#5CB85C');
    expect(normalizeColor('#abc')).toBe('#abc');
    expect(normalizeColor('label-danger')).toBe('#FF0000');
    expect(normalizeColor('##5CB85C')).toBe('#888888');
    expect(formatClock(new Date(NOW), { format24Hour: true, showSeconds: false }, 'en-GB')).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('unit status alerts', () => {
  const thresholds = [{ BaseType: 6, WarnSeconds: 120, AlertSeconds: 240 }];
  const ack = (extra: Partial<UnitStatusAlertAcknowledgementResultData> = {}): UnitStatusAlertAcknowledgementResultData =>
    ({ UnitStatusAlertAcknowledgementId: 'k', UnitId: 'u', UnitStateId: 55, Level: 1, Mode: 0, MutedUntilUtc: null, ClearedOnUtc: null, ...extra }) as UnitStatusAlertAcknowledgementResultData;

  it('evaluates warn/alert by base type and refuses to guess without a timestamp', () => {
    expect(evaluateUnitStatusAlert(unit('u', { CurrentStatusBaseType: 6, CurrentStatusTimestampUtc: ago(60) }), thresholds, NOW).level).toBe('none');
    expect(evaluateUnitStatusAlert(unit('u', { CurrentStatusBaseType: 6, CurrentStatusTimestampUtc: ago(150) }), thresholds, NOW)).toEqual({ level: 'warn', secondsInStatus: 150, thresholdSeconds: 120 });
    expect(evaluateUnitStatusAlert(unit('u', { CurrentStatusBaseType: 6, CurrentStatusTimestampUtc: ago(300) }), thresholds, NOW).level).toBe('alert');
    expect(evaluateUnitStatusAlert(unit('u', { CurrentStatusBaseType: 6, CurrentStatusTimestampUtc: '' }), thresholds, NOW).level).toBe('none');
    expect(evaluateUnitStatusAlert(unit('u', { CurrentStatusBaseType: 2, CurrentStatusTimestampUtc: ago(9999) }), thresholds, NOW).level).toBe('none');
    expect(evaluateUnitStatusAlert(unit('u', { CurrentStatusBaseType: 6, CurrentStatusTimestampUtc: ago(9999) }), [], NOW).level).toBe('none');
  });

  it('resolves acknowledgements by status episode, level and mute expiry', () => {
    const current = { CurrentUnitStateId: 55 };
    expect(resolveAcknowledgement(ack(), current, 'warn', NOW)).toBe('acknowledged');
    expect(resolveAcknowledgement(ack(), current, 'alert', NOW)).toBe('none');
    expect(resolveAcknowledgement(ack({ UnitStateId: 54 }), current, 'warn', NOW)).toBe('none');
    expect(resolveAcknowledgement(ack({ ClearedOnUtc: ago(10) }), current, 'warn', NOW)).toBe('none');
    expect(resolveAcknowledgement(ack({ Mode: 1, Level: 2 }), current, 'alert', NOW)).toBe('muted');
    expect(resolveAcknowledgement(ack({ Mode: 1, MutedUntilUtc: new Date(NOW + 60000).toISOString() }), current, 'warn', NOW)).toBe('muted');
    expect(resolveAcknowledgement(ack({ Mode: 1, MutedUntilUtc: ago(60) }), current, 'warn', NOW)).toBe('acknowledged');
    expect(resolveAcknowledgement(ack({ Mode: 1, MutedUntilUtc: 'soon' }), current, 'warn', NOW)).toBe('acknowledged');
    expect(resolveAcknowledgement(ack(), { CurrentUnitStateId: 0 }, 'warn', NOW)).toBe('none');
  });

  it('sorts alerts first, then warnings, acknowledged, and the rest', () => {
    expect(acknowledgedSortWeight('alert', 'none')).toBe(0);
    expect(acknowledgedSortWeight('warn', 'none')).toBe(1);
    expect(acknowledgedSortWeight('alert', 'acknowledged')).toBe(2);
    expect(acknowledgedSortWeight('warn', 'muted')).toBe(4);
    const a = annotateUnit(unit('a', { CurrentStatusBaseType: 6, CurrentStatusTimestampUtc: ago(150) }), thresholds, {}, NOW);
    const b = annotateUnit(unit('b', { CurrentStatusBaseType: 6, CurrentStatusTimestampUtc: ago(500) }), thresholds, {}, NOW);
    const c = annotateUnit(unit('c', { CurrentStatusBaseType: 6, CurrentStatusTimestampUtc: ago(200) }), thresholds, {}, NOW);
    expect([a, b, c].sort(compareAnnotatedUnits).map((entry) => entry.unit.UnitId)).toEqual(['b', 'c', 'a']);
  });

  it('knows when a reason is required, who may acknowledge, and which units no timer can cover', () => {
    expect(requiresAcknowledgementNote(2, 'warn')).toBe(true);
    expect(requiresAcknowledgementNote(1, 'warn')).toBe(false);
    expect(requiresAcknowledgementNote(1, 'alert')).toBe(true);
    expect(requiresAcknowledgementNote(undefined, 'alert')).toBe(false);
    expect(canAcknowledgeUnit({ CurrentUnitStateId: 4 }, true, false)).toBe(true);
    expect(canAcknowledgeUnit({ CurrentUnitStateId: 4 }, false, false)).toBe(false);
    expect(canAcknowledgeUnit({ CurrentUnitStateId: 4 }, true, true)).toBe(false);
    expect(canAcknowledgeUnit({}, true, false)).toBe(false);
    expect(countUnitsWithoutMeaning([unit('1', { CurrentStatusBaseType: -1 }), unit('2'), unit('3', { CurrentStatusBaseType: 0 })], thresholds)).toBe(2);
    expect(countUnitsWithoutMeaning([unit('1')], [])).toBe(0);
  });
});
