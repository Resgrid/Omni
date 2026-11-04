// When the unit's own timer fires, worked out ahead for the notifications the device shows while the app is in the
// background: the same thresholds and roster row as the on-screen timer, nothing for a status that already ended, and
// dispatch's mutes left out for the levels and times they cover.
import type { UnitInfoResultData, UnitStatusAlertAcknowledgementResultData } from '@resgrid/models';

import { isRosterBehind, scheduleUnitStatusTimer, type UnitStatusTimerScheduleInput } from '../lib/unit-status-alerts';

const STARTED = Date.UTC(2026, 10, 3, 12, 0, 0);

const DISPATCHED = 6;

const thresholds = [{ BaseType: DISPATCHED, WarnSeconds: 120, AlertSeconds: 240 }];

// SAFETY: a test fixture; only the roster fields the schedule reads are set.
const dispatched = (extra: Partial<UnitInfoResultData> = {}): UnitInfoResultData =>
  ({ UnitId: 'u1', Name: 'Engine 1', CurrentStatusBaseType: DISPATCHED, CurrentStatusTimestampUtc: new Date(STARTED).toISOString().replace('Z', ''), CurrentUnitStateId: 55, ...extra }) as UnitInfoResultData;

// SAFETY: a test fixture; only the acknowledgement fields the schedule reads are set.
const mute = (extra: Partial<UnitStatusAlertAcknowledgementResultData> = {}): UnitStatusAlertAcknowledgementResultData =>
  ({ UnitStatusAlertAcknowledgementId: 'k', UnitId: 'u1', UnitStateId: 55, Level: 1, Mode: 1, MutedUntilUtc: null, ClearedOnUtc: null, ...extra }) as UnitStatusAlertAcknowledgementResultData;

const input = (extra: Partial<UnitStatusTimerScheduleInput> = {}): UnitStatusTimerScheduleInput => ({ unit: dispatched(), thresholds, acknowledgement: null, hasPendingStatus: false, currentStatusUtc: null, ...extra });

describe('scheduleUnitStatusTimer', () => {
  it('fires at the warn and the alert threshold, counted from when the status began', () => {
    expect(scheduleUnitStatusTimer(input())).toEqual({
      episode: `u1:55:${STARTED}`,
      firings: [
        { level: 'warn', atSeconds: 120, at: STARTED + 120_000 },
        { level: 'alert', atSeconds: 240, at: STARTED + 240_000 },
      ],
    });
  });

  it('keeps firings already past (the device skips those) so the schedule does not change as time passes', () => {
    expect(scheduleUnitStatusTimer(input())?.firings).toHaveLength(2);
  });

  it('has nothing to fire for a status without a timer, without thresholds, or with an unreadable start', () => {
    expect(scheduleUnitStatusTimer(input({ unit: dispatched({ CurrentStatusBaseType: 0 }) }))?.firings).toEqual([]);
    expect(scheduleUnitStatusTimer(input({ thresholds: [] }))?.firings).toEqual([]);
    expect(scheduleUnitStatusTimer(input({ unit: dispatched({ CurrentStatusTimestampUtc: 'not a date' }) }))).toEqual({ episode: 'u1:55:unknown', firings: [] });
  });

  it('warns only before the alert, and fires a lone threshold on its own', () => {
    expect(scheduleUnitStatusTimer(input({ thresholds: [{ BaseType: DISPATCHED, WarnSeconds: 300, AlertSeconds: 240 }] }))?.firings.map((firing) => firing.level)).toEqual(['alert']);
    expect(scheduleUnitStatusTimer(input({ thresholds: [{ BaseType: DISPATCHED, WarnSeconds: 120, AlertSeconds: 0 }] }))?.firings.map((firing) => firing.level)).toEqual(['warn']);
    expect(scheduleUnitStatusTimer(input({ thresholds: [{ BaseType: DISPATCHED, WarnSeconds: 0, AlertSeconds: 240 }] }))?.firings.map((firing) => firing.level)).toEqual(['alert']);
  });

  it('is null once the status it would time has ended: a newer status queued, or the roster row behind', () => {
    expect(scheduleUnitStatusTimer(input({ hasPendingStatus: true }))).toBeNull();
    expect(scheduleUnitStatusTimer(input({ currentStatusUtc: new Date(STARTED + 30_000).toISOString() }))).toBeNull();
    // The current status record is the roster's own (within a second): still the same status.
    expect(scheduleUnitStatusTimer(input({ currentStatusUtc: new Date(STARTED + 500).toISOString() }))?.firings).toHaveLength(2);
  });

  it("leaves out what dispatch's mute covers: only the muted level, only until the mute runs out, only this status", () => {
    // Muted at warn until the status changes: the warning is out, the alert still fires.
    expect(scheduleUnitStatusTimer(input({ acknowledgement: mute() }))?.firings.map((firing) => firing.level)).toEqual(['alert']);
    // Muted at alert: nothing fires.
    expect(scheduleUnitStatusTimer(input({ acknowledgement: mute({ Level: 2 }) }))?.firings).toEqual([]);
    // Muted at alert for three minutes: the mute has run out when the alert fires at four.
    const threeMinutes = mute({ Level: 2, MutedUntilUtc: new Date(STARTED + 180_000).toISOString() });
    expect(scheduleUnitStatusTimer(input({ acknowledgement: threeMinutes }))?.firings.map((firing) => firing.level)).toEqual(['alert']);
    // A mute of the previous status, or one that was cleared, covers nothing.
    expect(scheduleUnitStatusTimer(input({ acknowledgement: mute({ Level: 2, UnitStateId: 54 }) }))?.firings).toHaveLength(2);
    expect(scheduleUnitStatusTimer(input({ acknowledgement: mute({ Level: 2, ClearedOnUtc: new Date(STARTED).toISOString() }) }))?.firings).toHaveLength(2);
    // Seen (not muted): the crew still hears it.
    expect(scheduleUnitStatusTimer(input({ acknowledgement: mute({ Level: 2, Mode: 0 }) }))?.firings).toHaveLength(2);
  });

  it('names the episode by unit, status record and start, so a new status is a new episode', () => {
    const first = scheduleUnitStatusTimer(input())?.episode;
    const next = scheduleUnitStatusTimer(input({ unit: dispatched({ CurrentUnitStateId: 56, CurrentStatusTimestampUtc: new Date(STARTED + 60_000).toISOString() }) }))?.episode;
    expect(next).not.toBe(first);
    // The same instant written with or without "Z" is the same episode.
    expect(scheduleUnitStatusTimer(input({ unit: dispatched({ CurrentStatusTimestampUtc: new Date(STARTED).toISOString() }) }))?.episode).toBe(first);
  });
});

describe('isRosterBehind', () => {
  it('is true only when the current status is more than a second newer than the roster row', () => {
    const roster = { CurrentStatusTimestampUtc: new Date(STARTED).toISOString() };
    expect(isRosterBehind(roster, null)).toBe(false);
    expect(isRosterBehind(roster, new Date(STARTED + 900).toISOString())).toBe(false);
    expect(isRosterBehind(roster, new Date(STARTED + 5_000).toISOString())).toBe(true);
  });
});
