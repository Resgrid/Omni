import './test-setup';

import { useUnitsStore, useUnitStatusAlertsStore } from '@resgrid/data';
import type { UnitStatusAlertAcknowledgementResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { UnitAlertsWidget } from '../components/widgets/unit-alerts-widget';
import { UnitsWidget } from '../components/widgets/units-widget';
import { useWidgetSettingsStore } from '../hooks/use-widget-settings-store';
import type { BoardUnit } from '../lib/unit-status-alerts';
import { setConfig, setRights, stubDataStores, utcAgo } from './fixtures';

const props = { isEditMode: false, width: 600, height: 400 };
const DISPATCHED = 6;
const unit = (UnitId: string, extra: Partial<BoardUnit> = {}): BoardUnit =>
  ({
    UnitId,
    Name: `Engine ${UnitId}`,
    GroupId: '1',
    GroupName: 'Station 1',
    Type: 'Engine',
    CurrentStatus: 'Dispatched',
    CurrentStatusColor: '5CB85C',
    CurrentStatusBaseType: DISPATCHED,
    CurrentUnitStateId: 100 + Number(UnitId),
    ...extra,
  }) as BoardUnit;
const ack = (UnitId: string, extra: Partial<UnitStatusAlertAcknowledgementResultData> = {}): UnitStatusAlertAcknowledgementResultData =>
  ({
    UnitStatusAlertAcknowledgementId: `k${UnitId}`,
    UnitId,
    UnitStateId: 100 + Number(UnitId),
    Level: 2,
    Mode: 0,
    MutedUntilUtc: null,
    Note: 'Malfunction',
    AcknowledgedByName: 'Sam',
    ClearedOnUtc: null,
    ...extra,
  }) as UnitStatusAlertAcknowledgementResultData;

let mocks: ReturnType<typeof stubDataStores>;

// Success toasts start 3 s dismiss timers.
afterEach(() => useToastStore.getState().clearToasts());

beforeEach(() => {
  mocks = stubDataStores();
  setConfig({ UnitStatusThresholds: [{ BaseType: DISPATCHED, WarnSeconds: 120, AlertSeconds: 240 }], UnitStatusAlertNoteRequirement: 0 });
  useUnitsStore.setState({
    unitInfos: [
      unit('1', { CurrentStatusTimestampUtc: utcAgo(30) }),
      unit('2', { CurrentStatusTimestampUtc: utcAgo(150) }),
      unit('3', { CurrentStatusTimestampUtc: utcAgo(600) }),
      unit('4', { CurrentStatusBaseType: -1, CurrentStatus: 'Custom', CurrentStatusTimestampUtc: utcAgo(900) }),
    ],
  });
});

describe('UnitsWidget', () => {
  it('highlights units past their timer, most urgent first, with the elapsed time', () => {
    render(<UnitsWidget {...props} />);
    expect(screen.getByTestId('unit-row-alert')).toBeTruthy();
    expect(screen.getByTestId('unit-row-warn')).toBeTruthy();
    expect(screen.getByText('10m')).toBeTruthy();
    const names = screen.getAllByText(/^Engine \d$/).map((node) => node.props.children);
    expect(names.slice(0, 2)).toEqual(['Engine 3', 'Engine 2']);
  });

  it('marks acknowledged and muted rows and only lets Create Call users open the sheet', () => {
    useUnitStatusAlertsStore.setState({ acknowledgements: { '3': ack('3'), '2': ack('2', { Level: 1, Mode: 1 }) } });
    const { unmount } = render(<UnitsWidget {...props} />);
    expect(screen.getByTestId('unit-row-alert-acknowledged')).toBeTruthy();
    expect(screen.getByTestId('unit-row-warn-muted')).toBeTruthy();
    expect(screen.getByTestId('units-table-row-press-3')).toBeTruthy();
    unmount();

    setRights({ CanCreateCalls: false });
    render(<UnitsWidget {...props} />);
    expect(screen.queryByTestId('units-table-row-press-3')).toBeNull();
  });

  it('acknowledges with a note through the sheet (online write, no outbox)', async () => {
    render(<UnitsWidget {...props} />);
    fireEvent.press(screen.getByTestId('units-table-row-press-3'));
    expect(await screen.findByTestId('unit-alert-acknowledge-sheet')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('unit-alert-note-input'), '  Pump fault  ');
    fireEvent.press(screen.getByTestId('unit-alert-acknowledge-button'));
    await waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledWith({ UnitId: 3, UnitStateId: 103, Level: 2, Mode: 0, MuteMinutes: 0, Note: 'Pump fault' }));
  });

  it('mutes for a chosen time and requires a reason when the department says so', async () => {
    setConfig({ UnitStatusThresholds: [{ BaseType: DISPATCHED, WarnSeconds: 120, AlertSeconds: 240 }], UnitStatusAlertNoteRequirement: 2 });
    render(<UnitsWidget {...props} />);
    fireEvent.press(screen.getByTestId('units-table-row-press-2'));
    expect(await screen.findByTestId('unit-alert-note-required-hint')).toBeTruthy();
    fireEvent.press(screen.getByTestId('unit-alert-mute-button'));
    expect(mocks.acknowledge).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('unit-alert-note-input'), 'Known delay');
    fireEvent.press(screen.getByTestId('unit-alert-mute-option-30'));
    fireEvent.press(screen.getByTestId('unit-alert-mute-button'));
    await waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledWith(expect.objectContaining({ UnitId: 2, Level: 1, Mode: 1, MuteMinutes: 30, Note: 'Known delay' })));
  });

  it('hides groups and honours column settings', () => {
    useWidgetSettingsStore.getState().updateSettings('units', { showType: false, hideGroups: ['1'] });
    render(<UnitsWidget {...props} />);
    expect(screen.getByTestId('units-table-empty')).toBeTruthy();
    expect(screen.queryByText('dashboard.column.type')).toBeNull();
  });
});

describe('UnitAlertsWidget', () => {
  it('lists only breaching units, collapses muted ones and counts units no timer can cover', () => {
    useUnitStatusAlertsStore.setState({ acknowledgements: { '2': ack('2', { Level: 1, Mode: 1 }) } });
    render(<UnitAlertsWidget {...props} />);
    expect(screen.getByTestId('unit-alert-alert')).toBeTruthy();
    expect(screen.queryByTestId('unit-alert-warn-muted')).toBeNull();
    fireEvent.press(screen.getByTestId('unit-alerts-muted-toggle'));
    expect(screen.getByTestId('unit-alert-warn-muted')).toBeTruthy();
    expect(screen.getByTestId('unit-alerts-without-meaning')).toHaveTextContent('unitAlerts.unitsWithoutMeaning:1');
  });

  it('tells "no timers" from "all within their timers" and treats an older server as unknown', () => {
    useUnitsStore.setState({ unitInfos: [unit('1', { CurrentStatusTimestampUtc: utcAgo(10) })] });
    const { unmount } = render(<UnitAlertsWidget {...props} />);
    expect(screen.getByTestId('unit-alerts-empty')).toHaveTextContent('unitAlerts.withinThresholds');
    unmount();

    setConfig({ UnitStatusThresholds: [] });
    const second = render(<UnitAlertsWidget {...props} />);
    expect(screen.getByTestId('unit-alerts-empty')).toHaveTextContent('unitAlerts.noThresholds');
    second.unmount();

    setConfig({ UnitStatusThresholds: undefined as never });
    render(<UnitAlertsWidget {...props} />);
    expect(screen.getByTestId('unit-alerts-error')).toBeTruthy();
  });

  it('waits for config before saying anything', () => {
    stubDataStores();
    render(<UnitAlertsWidget {...props} />);
    expect(screen.getByTestId('unit-alerts-loading')).toBeTruthy();
  });
});
