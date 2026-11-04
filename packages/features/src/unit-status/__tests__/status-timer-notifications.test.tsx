// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import './test-setup';

import { parseVariantManifest, resetActiveVariantForTests, setActiveVariant } from '@resgrid/config';
import { type QueuedUnitStatus, useUnitsStore, useUnitStatusAlertsStore, useUnitStatusStore } from '@resgrid/data';
import { useDepartmentConfigStore } from '@resgrid/features/department-config';
import { ActionBaseTypes, StatusProvider } from '@resgrid/features/status';
import { getUnitAlertsSyncHolders } from '@resgrid/features/unit-status-alerts';
import type { GetConfigResultData, UnitInfoResultData, UnitStatusAlertAcknowledgementResultData, UnitStatusResultData } from '@resgrid/models';
import { type ExactAlarmAccessView, type LocalNotificationSet, syncLocalNotifications } from '@resgrid/notifications';
import { act, render } from '@testing-library/react-native';
import React from 'react';

import icManifest from '../../../../../apps/omni/variants/ic/variant.json';
import { StatusTimerNotifications } from '../components/status-timer-notifications';
import { unitTimerNotifications } from '../lib/status-timer-text';
import { activateUnitVariant } from './test-helpers';

const sync = jest.mocked(syncLocalNotifications);

/** The setup's exact-alarm stand-in (drivable). */
const exactAlarms = jest.requireMock<{ mockExactAlarms: ExactAlarmAccessView }>('@resgrid/notifications').mockExactAlarms;

const T0 = Date.parse('2026-11-03T12:00:00Z');

const RESPONDING = ActionBaseTypes.Responding;

/** A UTC wire value `seconds` before T0, without "Z" (as some Core fields arrive). */
const ago = (seconds: number): string => new Date(T0 - seconds * 1000).toISOString().replace('Z', '');

// SAFETY: a test fixture; only the roster fields the timer reads are set.
const responding = (seconds: number, extra: Partial<UnitInfoResultData> = {}): UnitInfoResultData =>
  ({ UnitId: 'u1', Name: 'Engine 1', CurrentStatus: 'Responding', CurrentStatusBaseType: RESPONDING, CurrentStatusTimestampUtc: ago(seconds), CurrentUnitStateId: 501, ...extra }) as UnitInfoResultData;

// SAFETY: a test fixture; only the acknowledgement fields the timer reads are set.
const mute = (extra: Partial<UnitStatusAlertAcknowledgementResultData> = {}): UnitStatusAlertAcknowledgementResultData =>
  ({ UnitStatusAlertAcknowledgementId: 'k1', UnitId: 'u1', UnitStateId: 501, Level: 1, Mode: 1, MutedUntilUtc: null, ClearedOnUtc: null, ...extra }) as UnitStatusAlertAcknowledgementResultData;

// SAFETY: a test fixture; only the config fields the timers read are set.
const config = { UnitStatusThresholds: [{ BaseType: RESPONDING, WarnSeconds: 120, AlertSeconds: 300 }], UnitStatusAlertNoteRequirement: 0 } as GetConfigResultData;

const mocks = { fetchUnitInfos: jest.fn(async () => undefined), fetchAcknowledgements: jest.fn(async () => undefined), loadConfig: jest.fn(async () => undefined) };

/** What the last sync asked the device to have. */
const lastSet = (): LocalNotificationSet | null | undefined => sync.mock.calls.at(-1)?.[1];

const renderNotifier = (activeUnitId: string | null = 'u1') =>
  render(
    <StatusProvider activeUnitId={activeUnitId}>
      <StatusTimerNotifications />
    </StatusProvider>
  );

beforeEach(() => {
  jest.useFakeTimers({ now: T0 });
  activateUnitVariant();
  sync.mockClear();
  exactAlarms.access = 'notNeeded';
  Object.values(mocks).forEach((mock) => mock.mockClear());
  useUnitsStore.setState({ unitInfos: [responding(30)], fetchUnitInfos: mocks.fetchUnitInfos });
  useUnitStatusStore.setState({ currentStatusByUnit: {}, queuedStatuses: {} });
  useUnitStatusAlertsStore.setState({ acknowledgements: {}, loading: {}, errors: {}, fetchAcknowledgements: mocks.fetchAcknowledgements });
  useDepartmentConfigStore.setState({ config, load: mocks.loadConfig });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('StatusTimerNotifications', () => {
  it('schedules a notification for when the timer warns and one for when it fires, worded like the strip', async () => {
    await renderNotifier();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenLastCalledWith('statusTimer', {
      scope: 'u1',
      episode: `u1:501:${T0 - 30_000}`,
      notifications: [
        { key: 'warn', at: T0 + 90_000, title: 'unit_status.timer_warning:Responding,2m', body: 'unit_status.timer_notification_body:Engine 1' },
        { key: 'alert', at: T0 + 270_000, title: 'unit_status.timer_exceeded:Responding,5m', body: 'unit_status.timer_notification_body:Engine 1' },
      ],
    });
  });

  it('keeps the schedule as time passes: it is worked out once per status, not on a clock', async () => {
    await renderNotifier();
    await act(() => jest.advanceTimersByTime(120_000));
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('reschedules for the new status when the unit changes status', async () => {
    await renderNotifier();
    await act(() => useUnitsStore.setState({ unitInfos: [responding(0, { CurrentUnitStateId: 502 })] }));
    expect(lastSet()).toMatchObject({
      episode: `u1:502:${T0}`,
      notifications: [
        { key: 'warn', at: T0 + 120_000 },
        { key: 'alert', at: T0 + 300_000 },
      ],
    });

    // A status with no timer: nothing left to fire.
    await act(() => useUnitsStore.setState({ unitInfos: [responding(0, { CurrentUnitStateId: 503, CurrentStatusBaseType: ActionBaseTypes.InQuarters })] }));
    expect(lastSet()).toMatchObject({ episode: `u1:503:${T0}`, notifications: [] });
  });

  it('cancels as soon as a newer status waits in the outbox, and when the roster row is older than the current status', async () => {
    await renderNotifier();
    // SAFETY: a test fixture; only the fields the pending lookup reads are set.
    await act(() => useUnitStatusStore.setState({ queuedStatuses: { q1: { localId: 'q1', unitId: 'u1', statusType: '30', createdAt: T0, state: 'queued' } as QueuedUnitStatus } }));
    expect(lastSet()).toBeNull();

    await act(() => useUnitStatusStore.setState({ queuedStatuses: {} }));
    expect(lastSet()?.notifications).toHaveLength(2);

    // GetUnitStatus already has the next status; the roster row is the old one.
    // SAFETY: a test fixture; only the timestamp the staleness check reads is set.
    await act(() => useUnitStatusStore.setState({ currentStatusByUnit: { u1: { TimestampUtc: new Date(T0).toISOString() } as UnitStatusResultData } }));
    expect(lastSet()).toBeNull();
  });

  it("drops what dispatch's mute covers", async () => {
    await renderNotifier();
    await act(() => useUnitStatusAlertsStore.setState({ acknowledgements: { u1: mute() } }));
    expect(lastSet()?.notifications.map((notification) => notification.key)).toEqual(['alert']);

    await act(() => useUnitStatusAlertsStore.setState({ acknowledgements: { u1: mute({ Level: 2 }) } }));
    expect(lastSet()?.notifications).toEqual([]);
  });

  it("follows the department's timers", async () => {
    await renderNotifier();
    await act(() => useDepartmentConfigStore.setState({ config: { ...config, UnitStatusThresholds: [] } }));
    expect(lastSet()?.notifications).toEqual([]);
  });

  it('leaves the device alone until the timers and the roster row have loaded', async () => {
    useDepartmentConfigStore.setState({ config: null });
    useUnitsStore.setState({ unitInfos: [] });
    await renderNotifier();
    expect(sync).not.toHaveBeenCalled();

    await act(() => useDepartmentConfigStore.setState({ config }));
    expect(sync).not.toHaveBeenCalled();
    await act(() => useUnitsStore.setState({ unitInfos: [responding(30)] }));
    expect(lastSet()?.notifications).toHaveLength(2);
  });

  it('waits for the exact-alarm access, and schedules again when it changes (Android: allowed in system settings)', async () => {
    exactAlarms.access = null;
    const view = await renderNotifier();
    expect(sync).not.toHaveBeenCalled();

    exactAlarms.access = 'denied';
    await view.rerender(
      <StatusProvider activeUnitId="u1">
        <StatusTimerNotifications />
      </StatusProvider>
    );
    expect(sync).toHaveBeenCalledTimes(1);

    exactAlarms.access = 'granted';
    await view.rerender(
      <StatusProvider activeUnitId="u1">
        <StatusTimerNotifications />
      </StatusProvider>
    );
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('cancels everything without an active unit', async () => {
    await renderNotifier(null);
    expect(sync).toHaveBeenLastCalledWith('statusTimer', null);
  });

  it("keeps the unit's roster row fresh while it runs", async () => {
    await renderNotifier();
    expect(getUnitAlertsSyncHolders()).toBe(1);
    expect(mocks.fetchUnitInfos).toHaveBeenCalledWith({ bypassCache: true });
  });

  it('does nothing in an app without the unit status console', async () => {
    resetActiveVariantForTests();
    setActiveVariant(parseVariantManifest(icManifest));
    await renderNotifier();
    expect(sync).not.toHaveBeenCalled();
    expect(getUnitAlertsSyncHolders()).toBe(0);
  });
});

describe('unitTimerNotifications', () => {
  const t = (key: string, options?: Record<string, string>) => (options ? `${key}:${Object.values(options).join(',')}` : key);

  it('words each firing at the moment it shows', () => {
    const schedule = { episode: 'e', firings: [{ level: 'alert' as const, atSeconds: 4500, at: 1 }] };
    expect(unitTimerNotifications(t, schedule, { unit: 'Engine 1', status: 'On Scene' })).toEqual([
      { key: 'alert', at: 1, title: 'unit_status.timer_exceeded:On Scene,1h 15m', body: 'unit_status.timer_notification_body:Engine 1' },
    ]);
  });
});
