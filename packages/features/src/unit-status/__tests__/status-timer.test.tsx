// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import './test-setup';

import { setActiveVariant } from '@resgrid/config';
import { type QueuedUnitStatus, useUnitsStore, useUnitStatusAlertsStore, useUnitStatusStore } from '@resgrid/data';
import { useDepartmentConfigStore } from '@resgrid/features/department-config';
import { ActionBaseTypes, StatusProvider } from '@resgrid/features/status';
import { getUnitAlertsSyncHolders } from '@resgrid/features/unit-status-alerts';
import type { GetConfigResultData, UnitInfoResultData, UnitStatusAlertAcknowledgementResultData, UnitStatusResultData } from '@resgrid/models';
import type { ExactAlarmAccessView } from '@resgrid/notifications';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { StatusTimerBanner } from '../components/status-timer-banner';
import { StatusTimerCard } from '../components/status-timer-card';
import { unitTimerText } from '../lib/status-timer-text';
import { activateUnitVariant } from './test-helpers';

const T0 = Date.parse('2026-11-03T12:00:00Z');

/** A UTC wire value `seconds` before T0, without "Z" (as some Core fields arrive). */
const ago = (seconds: number): string => new Date(T0 - seconds * 1000).toISOString().replace('Z', '');
const RESPONDING = ActionBaseTypes.Responding;

// SAFETY: a test fixture; only the roster fields the timer reads are set.
const responding = (seconds: number, extra: Partial<UnitInfoResultData> = {}): UnitInfoResultData =>
  ({ UnitId: 'u1', Name: 'Engine 1', CurrentStatus: 'Responding', CurrentStatusBaseType: RESPONDING, CurrentStatusTimestampUtc: ago(seconds), CurrentUnitStateId: 501, ...extra }) as UnitInfoResultData;

// SAFETY: a test fixture; only the acknowledgement fields the timer reads are set.
const ack = (extra: Partial<UnitStatusAlertAcknowledgementResultData> = {}): UnitStatusAlertAcknowledgementResultData =>
  ({
    UnitStatusAlertAcknowledgementId: 'k1',
    UnitId: 'u1',
    UnitStateId: 501,
    Level: 2,
    Mode: 0,
    MutedUntilUtc: null,
    Note: 'Traffic on I-80',
    AcknowledgedByName: 'Sam Dispatcher',
    ClearedOnUtc: null,
    ...extra,
  }) as UnitStatusAlertAcknowledgementResultData;

/** The setup's exact-alarm stand-in (drivable). */
const exactAlarms = jest.requireMock<{ mockExactAlarms: ExactAlarmAccessView }>('@resgrid/notifications').mockExactAlarms;

const mocks = { fetchUnitInfos: jest.fn(async () => undefined), fetchAcknowledgements: jest.fn(async () => undefined), loadConfig: jest.fn(async () => undefined) };

const setUnit = (info: UnitInfoResultData) => useUnitsStore.setState({ unitInfos: [info] });

const renderWithUnit = (node: React.ReactElement, activeUnitId: string | null = 'u1') => render(<StatusProvider activeUnitId={activeUnitId}>{node}</StatusProvider>);

beforeEach(() => {
  jest.useFakeTimers({ now: T0 });
  activateUnitVariant();
  exactAlarms.access = 'notNeeded';
  Object.values(mocks).forEach((mock) => mock.mockClear());
  useUnitsStore.setState({ unitInfos: [responding(30)], fetchUnitInfos: mocks.fetchUnitInfos });
  useUnitStatusStore.setState({ currentStatusByUnit: {}, queuedStatuses: {} });
  useUnitStatusAlertsStore.setState({ acknowledgements: {}, loading: {}, errors: {}, fetchAcknowledgements: mocks.fetchAcknowledgements });
  // SAFETY: a test fixture; only the config fields the timers read are set.
  useDepartmentConfigStore.setState({
    config: { UnitStatusThresholds: [{ BaseType: RESPONDING, WarnSeconds: 120, AlertSeconds: 300 }], UnitStatusAlertNoteRequirement: 0 } as GetConfigResultData,
    load: mocks.loadConfig,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('unitTimerText', () => {
  const t = (key: string, options?: Record<string, string>) => (options ? `${key}:${Object.values(options).join(',')}` : key);

  it('says when the timer warns, counts down once it is close, and how far over once it fires', () => {
    expect(unitTimerText(t, { alert: { level: 'none', secondsInStatus: 30, thresholdSeconds: null }, next: { level: 'warn', atSeconds: 120, inSeconds: 90 }, approaching: false }, 'Responding')).toEqual({
      headline: 'unit_status.timer_in_status:Responding,30s',
      detail: 'unit_status.timer_warn_at:2m',
      tone: 'neutral',
    });
    expect(unitTimerText(t, { alert: { level: 'none', secondsInStatus: 100, thresholdSeconds: null }, next: { level: 'warn', atSeconds: 120, inSeconds: 20 }, approaching: true }, 'Responding')).toMatchObject({
      headline: 'unit_status.timer_warn_in:20s',
      tone: 'approaching',
    });
    expect(unitTimerText(t, { alert: { level: 'warn', secondsInStatus: 150, thresholdSeconds: 120 }, next: { level: 'alert', atSeconds: 300, inSeconds: 150 }, approaching: false }, 'Responding')).toEqual({
      headline: 'unit_status.timer_warning:Responding,2m',
      detail: 'unit_status.timer_alert_in:2m',
      tone: 'warn',
    });
    expect(unitTimerText(t, { alert: { level: 'alert', secondsInStatus: 540, thresholdSeconds: 300 }, next: null, approaching: false }, 'Responding')).toEqual({
      headline: 'unit_status.timer_exceeded:Responding,9m',
      detail: null,
      tone: 'alert',
    });
  });
});

describe('StatusTimerCard', () => {
  it('shows the time in status and when the timer warns, then counts down, warns and alerts as time passes', async () => {
    await renderWithUnit(<StatusTimerCard unitId="u1" />);
    expect(screen.getByTestId('unit-status-timer-neutral')).toBeTruthy();
    expect(screen.getByTestId('unit-status-timer-headline')).toHaveTextContent('unit_status.timer_in_status:Responding,30s');
    expect(screen.getByTestId('unit-status-timer-detail')).toHaveTextContent('unit_status.timer_warn_at:2m');

    // 30 s before the warning (a quarter of two minutes): the countdown.
    await act(() => jest.advanceTimersByTime(60_000));
    expect(screen.getByTestId('unit-status-timer-approaching')).toBeTruthy();
    expect(screen.getByTestId('unit-status-timer-headline')).toHaveTextContent('unit_status.timer_warn_in:30s');

    await act(() => jest.advanceTimersByTime(60_000));
    expect(screen.getByTestId('unit-status-timer-warn')).toBeTruthy();
    expect(screen.getByTestId('unit-status-timer-detail')).toHaveTextContent('unit_status.timer_alert_in:2m');

    await act(() => jest.advanceTimersByTime(150_000));
    expect(screen.getByTestId('unit-status-timer-alert')).toBeTruthy();
    expect(screen.getByTestId('unit-status-timer-headline')).toHaveTextContent('unit_status.timer_exceeded:Responding,5m');
  });

  it('says who at dispatch has seen the alert, with their note', async () => {
    setUnit(responding(400));
    useUnitStatusAlertsStore.setState({ acknowledgements: { u1: ack() } });
    await renderWithUnit(<StatusTimerCard unitId="u1" />);
    expect(screen.getByTestId('unit-status-timer-acknowledged')).toHaveTextContent('unitAlerts.acknowledgedBy:Sam Dispatcher: Traffic on I-80');
  });

  it('shows nothing without a timer for the status, while a newer status waits to sync, or while the roster is behind', async () => {
    setUnit(responding(30, { CurrentStatusBaseType: ActionBaseTypes.InQuarters }));
    const view = await renderWithUnit(<StatusTimerCard unitId="u1" />);
    expect(screen.queryByTestId('unit-status-timer-neutral')).toBeNull();
    await view.unmount();

    setUnit(responding(400));
    // SAFETY: a test fixture; only the fields the pending lookup reads are set.
    useUnitStatusStore.setState({ queuedStatuses: { q1: { localId: 'q1', unitId: 'u1', statusType: '30', createdAt: T0, state: 'queued' } as QueuedUnitStatus } });
    const pending = await renderWithUnit(<StatusTimerCard unitId="u1" />);
    expect(screen.queryByTestId('unit-status-timer-alert')).toBeNull();
    await pending.unmount();

    // GetUnitStatus already has the next status; the roster row is the old one.
    // SAFETY: a test fixture; only the timestamp the staleness check reads is set.
    useUnitStatusStore.setState({ queuedStatuses: {}, currentStatusByUnit: { u1: { TimestampUtc: new Date(T0 - 5_000).toISOString() } as UnitStatusResultData } });
    await renderWithUnit(<StatusTimerCard unitId="u1" />);
    expect(screen.queryByTestId('unit-status-timer-alert')).toBeNull();
  });

  it('says the background alerts may come late while exact alarms are off (Android) and opens the screen to allow them', async () => {
    const allowed = await renderWithUnit(<StatusTimerCard unitId="u1" />);
    expect(screen.queryByTestId('unit-status-timer-exact-alarms')).toBeNull();
    await allowed.unmount();

    exactAlarms.access = 'denied';
    await renderWithUnit(<StatusTimerCard unitId="u1" />);
    expect(screen.getByTestId('unit-status-timer-exact-alarms')).toHaveTextContent('unit_status.timer_exact_alarms_hintunit_status.timer_exact_alarms_allow');
    await fireEvent.press(screen.getByTestId('unit-status-timer-exact-alarms'));
    expect(exactAlarms.request).toHaveBeenCalledTimes(1);
  });

  it('keeps acknowledgements and its own roster row live while shown, and lets go when it unmounts', async () => {
    const view = await renderWithUnit(<StatusTimerCard unitId="u1" />);
    expect(getUnitAlertsSyncHolders()).toBe(1);
    expect(mocks.fetchUnitInfos).toHaveBeenCalledWith({ bypassCache: true });
    mocks.fetchUnitInfos.mockClear();
    mocks.fetchAcknowledgements.mockClear();

    await act(() => emitRealtimeEvent('unitStatusAlertUpdated', 'u1'));
    expect(mocks.fetchAcknowledgements).toHaveBeenCalledWith({ bypassCache: true });
    // Another unit's status change is not this unit's business; its own is.
    await act(() => emitRealtimeEvent('unitStatusUpdated', 'u9'));
    expect(mocks.fetchUnitInfos).not.toHaveBeenCalled();
    await act(() => emitRealtimeEvent('unitStatusUpdated', 'u1'));
    expect(mocks.fetchUnitInfos).toHaveBeenCalledWith({ bypassCache: true });

    await view.unmount();
    expect(getUnitAlertsSyncHolders()).toBe(0);
    mocks.fetchAcknowledgements.mockClear();
    await act(() => emitRealtimeEvent('unitStatusAlertUpdated', 'u1'));
    expect(mocks.fetchAcknowledgements).not.toHaveBeenCalled();
  });
});

describe('StatusTimerBanner', () => {
  it('stays out of the way while the unit is well within its timer', async () => {
    await renderWithUnit(<StatusTimerBanner />);
    expect(screen.queryByTestId('unit-status-timer-banner-headline')).toBeNull();
  });

  it('appears once the timer is close, turns red once it fires, and opens the status console', async () => {
    setUnit(responding(100));
    await renderWithUnit(<StatusTimerBanner />);
    expect(screen.getByTestId('unit-status-timer-banner-approaching')).toBeTruthy();
    expect(screen.getByTestId('unit-status-timer-banner-headline')).toHaveTextContent('unit_status.timer_warn_in:20s');

    await act(() => jest.advanceTimersByTime(210_000));
    expect(screen.getByTestId('unit-status-timer-banner-alert')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('unit-status-timer-banner-alert'));
    expect(router.push).toHaveBeenCalledWith('/console');
  });

  it('marks an alert dispatch has seen and hides one dispatch muted', async () => {
    setUnit(responding(400));
    useUnitStatusAlertsStore.setState({ acknowledgements: { u1: ack() } });
    const view = await renderWithUnit(<StatusTimerBanner />);
    expect(screen.getByTestId('unit-status-timer-banner-acknowledged')).toBeTruthy();
    await view.unmount();

    useUnitStatusAlertsStore.setState({ acknowledgements: { u1: ack({ Mode: 1 }) } });
    await renderWithUnit(<StatusTimerBanner />);
    expect(screen.queryByTestId('unit-status-timer-banner-alert')).toBeNull();
  });

  it('renders nothing on the console itself, without an active unit, or in an app without the unit console', async () => {
    setUnit(responding(400));
    const onConsole = await renderWithUnit(<StatusTimerBanner hidden />);
    expect(screen.queryByTestId('unit-status-timer-banner-alert')).toBeNull();
    await onConsole.unmount();

    const noUnit = await renderWithUnit(<StatusTimerBanner />, null);
    expect(screen.queryByTestId('unit-status-timer-banner-alert')).toBeNull();
    await noUnit.unmount();

    const manifest = activateUnitVariant();

    setActiveVariant({ ...manifest, modules: manifest.modules.filter((module) => module !== 'unit-status') });
    await renderWithUnit(<StatusTimerBanner />);
    expect(screen.queryByTestId('unit-status-timer-banner-alert')).toBeNull();
  });
});
