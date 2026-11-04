import './test-setup';

import { formatUtcInDepartmentTime, getTimeZoneOffsetMinutes, zonedWallClockToUtc } from '@resgrid/core/utils/dates';
import { useCallDetailStore, useCallsStore } from '@resgrid/data';
import { setDepartmentConfig } from '@resgrid/features/department-config';
import type { GetConfigResultData } from '@resgrid/models';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { CallQueueBanner } from '../components/detail/call-queue-banner';
import { RescheduleCallSheet, toDispatchWallClock } from '../components/reschedule-call-sheet';
import { activateVariant, hidden } from './test-utils';

// Core reads `UpdateScheduledDispatchTime`'s wall clock in the department's zone (DateTimeHelpers.ConvertToUtc); this is that
// read, so a test can check the instant the server will store.
const readByCore = (wallClock: string, zoneId: string): number => {
  const [year, month, day, hour, minute, second] = wallClock.split(/\D/).map(Number);

  return zonedWallClockToUtc({ year, month, day, hour, minute, second }, zoneId).getTime();
};

const AT = new Date('2026-07-15T17:30:00Z');

// A department zone guaranteed to differ from whatever zone the test machine runs in (Tokyo never observes DST).
const departmentZone = getTimeZoneOffsetMinutes(AT, null) === 540 ? 'America/Chicago' : 'Asia/Tokyo';

const withDepartmentZone = (TimeZoneId: string | null) =>
  // SAFETY: a test fixture; only the field these screens read is set.
  setDepartmentConfig({ TimeZoneId } as GetConfigResultData);

beforeEach(() => {
  activateVariant('dispatch');
  setDepartmentConfig(null);
});

describe('toDispatchWallClock', () => {
  it('writes the instant as the department wall clock (IANA or Windows id)', () => {
    expect(toDispatchWallClock(AT, 'America/Chicago')).toBe('2026-07-15T12:30:00');
    expect(toDispatchWallClock(AT, 'Central Standard Time')).toBe('2026-07-15T12:30:00');
    expect(toDispatchWallClock(AT, 'Asia/Tokyo')).toBe('2026-07-16T02:30:00');
  });

  it('round-trips through Core when the department zone is not the device zone', () => {
    const wallClock = toDispatchWallClock(AT, departmentZone);

    expect(readByCore(wallClock, departmentZone)).toBe(AT.getTime());
    // The device wall clock (the old behaviour) would have been read as a different instant.
    expect(wallClock).not.toBe(toDispatchWallClock(AT, null));
  });

  it('falls back to the device wall clock when the department zone is unknown', () => {
    const wallClock = toDispatchWallClock(AT, null);

    // A zone-less date-time string is device-local in JavaScript.
    expect(new Date(wallClock).getTime()).toBe(AT.getTime());
  });
});

describe('RescheduleCallSheet in the department zone', () => {
  const HOUR_MS = 60 * 60 * 1000;
  // SAFETY: the sheet reads only the call's schedule fields.
  const scheduledCall = (at: number) => ({ CallId: '5', State: 0, ScheduledOnUtc: new Date(at).toISOString(), DispatchedOnUtc: '' }) as never;

  const openSheet = async () => {
    const reschedule = jest.fn<Promise<void>, [string, string]>(async () => undefined);

    useCallDetailStore.setState({
      details: { '5': { call: scheduledCall(Date.now() + 5 * HOUR_MS), extraData: null, notes: [], images: null, files: null, audio: null, fetchedAt: 1 } },
      rescheduleDispatchTime: reschedule,
    });
    useCallsStore.setState({ refreshQueuedCallLists: jest.fn(async () => undefined), fetchCalls: jest.fn(async () => undefined) });
    await render(<RescheduleCallSheet isOpen onClose={jest.fn()} callId="5" />);

    return reschedule;
  };

  const submit = async (presetTestId: string) => {
    await fireEvent.press(screen.getByTestId(presetTestId, hidden));
    await act(async () => fireEvent.press(screen.getByTestId('reschedule-submit', hidden)));
  };

  it('sends the picked instant as the department wall clock', async () => {
    withDepartmentZone(departmentZone);
    const reschedule = await openSheet();
    const pickedAt = Date.now() + HOUR_MS;

    await submit('reschedule-reschedule_in_1_hour');
    const [callId, wallClock] = reschedule.mock.calls[0];

    expect(callId).toBe('5');
    expect(Math.abs(readByCore(wallClock, departmentZone) - pickedAt)).toBeLessThan(60_000);
  });

  it('puts "tomorrow morning" at 08:00 department time, or device time without a department zone', async () => {
    withDepartmentZone(departmentZone);
    let reschedule = await openSheet();

    await submit('reschedule-reschedule_tomorrow_morning');
    expect(reschedule.mock.calls[0][1]).toMatch(/T08:00:00$/);

    setDepartmentConfig(null);
    reschedule = await openSheet();
    await submit('reschedule-reschedule_tomorrow_morning');
    expect(reschedule.mock.calls[0][1]).toMatch(/T08:00:00$/);
    expect(new Date(reschedule.mock.calls[0][1]).getHours()).toBe(8);
  });
});

describe('CallQueueBanner', () => {
  const dispatchAtUtc = '2026-07-15T17:30:00';

  it('shows the scheduled time in the department zone', async () => {
    withDepartmentZone(departmentZone);
    await render(<CallQueueBanner kind="scheduled" dispatchAtUtc={dispatchAtUtc} />);

    expect(screen.getByText(`scheduled_calls.scheduled_for: ${formatUtcInDepartmentTime(dispatchAtUtc, departmentZone)}`, hidden)).toBeTruthy();
  });

  it('keeps the device zone when the server sends no department zone', async () => {
    withDepartmentZone(null);
    await render(<CallQueueBanner kind="scheduled" dispatchAtUtc={dispatchAtUtc} />);

    expect(screen.getByText(`scheduled_calls.scheduled_for: ${formatUtcInDepartmentTime(dispatchAtUtc, null)}`, hidden)).toBeTruthy();
  });
});
