import type { UnitInfoResultData, UnitStatusAlertAcknowledgementResultData } from '@resgrid/models';

import {
  acknowledgedSortWeight,
  annotateUnit,
  approachLeadSeconds,
  canAcknowledgeUnit,
  compareAnnotatedUnits,
  countUnitsWithoutMeaning,
  evaluateUnitStatusAlert,
  evaluateUnitStatusTimer,
  formatElapsed,
  NO_TIMER,
  requiresAcknowledgementNote,
  resolveAcknowledgement,
  summarizeUnitAlerts,
} from '../lib/unit-status-alerts';

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);

/** A UTC wire value `seconds` ago, without "Z" (as some Core fields arrive). */
const ago = (seconds: number): string => new Date(NOW - seconds * 1000).toISOString().replace('Z', '');

// SAFETY: a test fixture; only the roster fields the timer rules read are set.
const unit = (UnitId: string, extra: Partial<UnitInfoResultData> = {}): UnitInfoResultData => ({ UnitId, Name: UnitId, GroupId: '', ...extra }) as UnitInfoResultData;
const DISPATCHED = 6;
const thresholds = [{ BaseType: DISPATCHED, WarnSeconds: 120, AlertSeconds: 240 }];

// SAFETY: a test fixture; only the acknowledgement fields the timer rules read are set.
const ack = (extra: Partial<UnitStatusAlertAcknowledgementResultData> = {}): UnitStatusAlertAcknowledgementResultData =>
  ({ UnitStatusAlertAcknowledgementId: 'k', UnitId: 'u', UnitStateId: 55, Level: 1, Mode: 0, MutedUntilUtc: null, ClearedOnUtc: null, ...extra }) as UnitStatusAlertAcknowledgementResultData;

const dispatchedFor = (seconds: number, extra: Partial<UnitInfoResultData> = {}) => unit('u', { CurrentStatusBaseType: DISPATCHED, CurrentStatusTimestampUtc: ago(seconds), CurrentUnitStateId: 55, ...extra });

describe('unit status alerts', () => {
  it('formats durations compactly', () => {
    expect(formatElapsed(45)).toBe('45s');
    expect(formatElapsed(4 * 60)).toBe('4m');
    expect(formatElapsed(72 * 60)).toBe('1h 12m');
    expect(formatElapsed(null)).toBe('');
    expect(formatElapsed(-1)).toBe('');
  });

  it('evaluates warn/alert by base type and refuses to guess without a timestamp', () => {
    expect(evaluateUnitStatusAlert(dispatchedFor(60), thresholds, NOW).level).toBe('none');
    expect(evaluateUnitStatusAlert(dispatchedFor(150), thresholds, NOW)).toEqual({ level: 'warn', secondsInStatus: 150, thresholdSeconds: 120 });
    expect(evaluateUnitStatusAlert(dispatchedFor(300), thresholds, NOW).level).toBe('alert');
    expect(evaluateUnitStatusAlert(unit('u', { CurrentStatusBaseType: DISPATCHED, CurrentStatusTimestampUtc: '' }), thresholds, NOW).level).toBe('none');
    expect(evaluateUnitStatusAlert(unit('u', { CurrentStatusBaseType: 2, CurrentStatusTimestampUtc: ago(9999) }), thresholds, NOW).level).toBe('none');
    expect(evaluateUnitStatusAlert(unit('u', { CurrentStatusBaseType: null, CurrentStatusTimestampUtc: ago(9999) }), thresholds, NOW).level).toBe('none');
    expect(evaluateUnitStatusAlert(dispatchedFor(9999), [], NOW).level).toBe('none');
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
    expect(resolveAcknowledgement(ack(), { CurrentUnitStateId: null }, 'warn', NOW)).toBe('none');
  });

  it('sorts alerts first, then warnings, acknowledged, and the rest', () => {
    expect(acknowledgedSortWeight('alert', 'none')).toBe(0);
    expect(acknowledgedSortWeight('warn', 'none')).toBe(1);
    expect(acknowledgedSortWeight('alert', 'acknowledged')).toBe(2);
    expect(acknowledgedSortWeight('warn', 'muted')).toBe(4);
    const a = annotateUnit(unit('a', { CurrentStatusBaseType: DISPATCHED, CurrentStatusTimestampUtc: ago(150) }), thresholds, {}, NOW);
    const b = annotateUnit(unit('b', { CurrentStatusBaseType: DISPATCHED, CurrentStatusTimestampUtc: ago(500) }), thresholds, {}, NOW);
    const c = annotateUnit(unit('c', { CurrentStatusBaseType: DISPATCHED, CurrentStatusTimestampUtc: ago(200) }), thresholds, {}, NOW);

    expect([a, b, c].sort(compareAnnotatedUnits).map((entry) => entry.unit.UnitId)).toEqual(['b', 'c', 'a']);
  });

  it('counts the units still to be contacted for a console tile', () => {
    const rows = [
      annotateUnit(unit('1', { CurrentStatusBaseType: DISPATCHED, CurrentStatusTimestampUtc: ago(150), CurrentUnitStateId: 1 }), thresholds, {}, NOW),
      annotateUnit(unit('2', { CurrentStatusBaseType: DISPATCHED, CurrentStatusTimestampUtc: ago(300), CurrentUnitStateId: 2 }), thresholds, { '2': ack({ UnitId: '2', UnitStateId: 2, Level: 2 }) }, NOW),
      annotateUnit(unit('3', { CurrentStatusBaseType: DISPATCHED, CurrentStatusTimestampUtc: ago(300), CurrentUnitStateId: 3 }), thresholds, { '3': ack({ UnitId: '3', UnitStateId: 3, Level: 2, Mode: 1 }) }, NOW),
      annotateUnit(unit('4', { CurrentStatusBaseType: DISPATCHED, CurrentStatusTimestampUtc: ago(30) }), thresholds, {}, NOW),
    ];

    expect(summarizeUnitAlerts(rows)).toEqual({ unacknowledged: 1, worstUnacknowledged: 'warn', active: 2 });
    expect(summarizeUnitAlerts([...rows, annotateUnit(unit('5', { CurrentStatusBaseType: DISPATCHED, CurrentStatusTimestampUtc: ago(900) }), thresholds, {}, NOW)])).toMatchObject({
      unacknowledged: 2,
      worstUnacknowledged: 'alert',
    });
    expect(summarizeUnitAlerts([])).toEqual({ unacknowledged: 0, worstUnacknowledged: 'none', active: 0 });
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

describe("the unit's own status timer", () => {
  it('counts down to the warning, then to the alert, and stops once alerting', () => {
    expect(evaluateUnitStatusTimer(dispatchedFor(30), thresholds, NOW)).toEqual({
      hasTimer: true,
      alert: { level: 'none', secondsInStatus: 30, thresholdSeconds: null },
      next: { level: 'warn', atSeconds: 120, inSeconds: 90 },
      approaching: false,
    });
    expect(evaluateUnitStatusTimer(dispatchedFor(150), thresholds, NOW)).toMatchObject({ alert: { level: 'warn' }, next: { level: 'alert', atSeconds: 240, inSeconds: 90 }, approaching: false });
    expect(evaluateUnitStatusTimer(dispatchedFor(300), thresholds, NOW)).toMatchObject({ alert: { level: 'alert' }, next: null, approaching: false });
  });

  it('warns the unit shortly before its first threshold (a quarter of it, at most a minute)', () => {
    expect(approachLeadSeconds(120)).toBe(30);
    expect(approachLeadSeconds(1800)).toBe(60);
    expect(evaluateUnitStatusTimer(dispatchedFor(89), thresholds, NOW).approaching).toBe(false);
    expect(evaluateUnitStatusTimer(dispatchedFor(90), thresholds, NOW)).toMatchObject({ approaching: true, next: { level: 'warn', inSeconds: 30 } });
    // Only an alert time configured: the heads-up comes before the alert.
    expect(evaluateUnitStatusTimer(dispatchedFor(200), [{ BaseType: DISPATCHED, WarnSeconds: 0, AlertSeconds: 240 }], NOW)).toMatchObject({ approaching: true, next: { level: 'alert', inSeconds: 40 } });
  });

  it('has no timer without a threshold for the status or a usable timestamp', () => {
    expect(evaluateUnitStatusTimer(dispatchedFor(30), [], NOW)).toBe(NO_TIMER);
    expect(evaluateUnitStatusTimer(dispatchedFor(30, { CurrentStatusBaseType: 2 }), thresholds, NOW)).toBe(NO_TIMER);
    expect(evaluateUnitStatusTimer(dispatchedFor(30, { CurrentStatusTimestampUtc: 'garbage' }), thresholds, NOW)).toBe(NO_TIMER);
    expect(evaluateUnitStatusTimer(dispatchedFor(30), [{ BaseType: DISPATCHED, WarnSeconds: 0, AlertSeconds: 0 }], NOW)).toBe(NO_TIMER);
  });
});
