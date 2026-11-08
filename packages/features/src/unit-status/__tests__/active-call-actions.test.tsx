import './test-setup';

import { parseVariantManifest, resetActiveVariantForTests, setActiveVariant } from '@resgrid/config';
import { useCallDetailStore, useCallsStore, useUnitRolesStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { ActionBaseTypes, StatusProvider } from '@resgrid/features/status';
import { CallResultData, type StatusesResultData, UnitResultData, UnitTypeStatusResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import responderManifest from '../../../../../apps/omni/variants/responder/variant.json';
import { ActiveCallCard } from '../components/active-call-card';
import { SetActiveCallButton } from '../components/set-active-call-button';
import { activateUnitVariant, hidden } from './test-helpers';

const makeCall = (CallId: string, overrides: Partial<CallResultData> = {}): CallResultData =>
  Object.assign(new CallResultData(), {
    CallId,
    Priority: 1,
    Name: `Call ${CallId}`,
    Nature: '<p>Smoke showing</p>',
    Address: `${CallId} Main St`,
    Number: `C-${CallId}`,
    State: 0,
    Type: 'Fire',
    LoggedOnUtc: '2026-11-01T10:00:00Z',
    Latitude: '39.5',
    Longitude: '-119.8',
    ...overrides,
  });

const option = (Id: number, Text: string, extra: Partial<StatusesResultData> = {}): StatusesResultData => ({
  Id,
  Type: 0,
  StateId: 0,
  Text,
  BColor: '#22c55e',
  Color: '#ffffff',
  Gps: false,
  Note: 0,
  Detail: 0,
  ...extra,
});

const saveUnitStatus = jest.fn(async () => ({ outcome: 'sent' as const, id: 'evt-1' }));

const navigateTo = jest.fn(async () => true);

beforeEach(() => {
  activateUnitVariant();
  saveUnitStatus.mockClear();
  useToastStore.getState().clearToasts();
  useCallsStore.setState({ calls: [makeCall('7'), makeCall('8', { Name: 'Medical' })], callPriorities: [], loading: {}, errors: {}, fetchCalls: jest.fn(async () => undefined) });
  useCallDetailStore.setState({
    details: {},
    queuedNotes: {},
    queuedFiles: {},
    loading: {},
    errors: {},
    fetchCallDetail: jest.fn(async () => undefined),
    fetchCallNotes: jest.fn(async () => undefined),
  });
  useUnitsStore.setState({
    units: [Object.assign(new UnitResultData(), { UnitId: 'u1', Name: 'Engine 1', Type: 'Engine', CustomStatusSetId: '5' })],
    unitInfos: [],
    unitTypeStatuses: [
      Object.assign(new UnitTypeStatusResultData(), {
        UnitType: 'Engine',
        StatusId: '5',
        Statuses: [option(30, 'In Quarters', { BaseType: ActionBaseTypes.InQuarters }), option(31, 'Responding', { BaseType: ActionBaseTypes.Responding, Detail: 3, Note: 1 })],
      }),
    ],
    fetchUnits: jest.fn(async () => undefined),
  });
  useUnitStatusStore.setState({
    currentStatusByUnit: {},
    queuedStatuses: {},
    destinationsByUnit: { u1: { calls: [], stations: [], pois: [], poiTypes: [], statuses: [], fetchedAt: Date.now() } },
    fetchCurrentStatus: jest.fn(async () => undefined),
    fetchDestinationData: jest.fn(async () => undefined),
    saveUnitStatus,
  });
  useUnitRolesStore.setState({ assignmentsByUnit: { u1: [] } });
});

describe('ActiveCallCard', () => {
  const renderCard = async (props: { activeCallId: string | null; onSelectCall?: (callId: string) => void }) => {
    const onNavigate = jest.fn();
    await render(
      <NavigationHandoffProvider value={{ navigateTo }}>
        <ActiveCallCard activeCallId={props.activeCallId} onSelectCall={props.onSelectCall} onNavigate={onNavigate} />
      </NavigationHandoffProvider>
    );

    return { onNavigate };
  };

  it('opens the call summary when the active call is tapped, and the full detail from there', async () => {
    const { onNavigate } = await renderCard({ activeCallId: '7', onSelectCall: jest.fn() });

    await fireEvent.press(screen.getByTestId('unit-active-call-trigger'));
    expect(screen.getByTestId('unit-active-call-summary-summary', hidden)).toBeTruthy();
    expect(screen.queryByTestId('active-call-sheet-call-8', hidden)).toBeNull();
    expect(useCallDetailStore.getState().fetchCallDetail).toHaveBeenCalledWith('7');

    await fireEvent.press(screen.getByTestId('unit-active-call-summary-details', hidden));
    expect(router.push).toHaveBeenCalledWith('/call/7');
    expect(onNavigate).toHaveBeenCalled();
  });

  it('describes what the tap does: the summary for a call, the picker without one', async () => {
    await renderCard({ activeCallId: '7', onSelectCall: jest.fn() });
    expect(screen.getByTestId('unit-active-call-trigger').props.accessibilityHint).toBe('calls.call_summary_hint');
  });

  it('changes the active call from a button of its own', async () => {
    const onSelectCall = jest.fn();
    await renderCard({ activeCallId: '7', onSelectCall });

    await fireEvent.press(screen.getByTestId('unit-active-call-change'));
    await waitFor(() => expect(screen.getByTestId('active-call-sheet-call-8', hidden)).toBeTruthy());
    await fireEvent.press(screen.getByTestId('active-call-sheet-call-8', hidden));
    expect(onSelectCall).toHaveBeenCalledWith('8');
  });

  it('has no change button where the shell cannot change the active call', async () => {
    await renderCard({ activeCallId: '7' });
    expect(screen.queryByTestId('unit-active-call-change')).toBeNull();
  });
});

describe('SetActiveCallButton', () => {
  const renderButton = async (call: CallResultData, context: { activeUnitId?: string | null; activeCallId?: string | null; onActiveCallChange?: (callId: string) => void } = {}) => {
    const onActiveCallChange = 'onActiveCallChange' in context ? context.onActiveCallChange : jest.fn();
    await render(
      <StatusProvider activeUnitId={context.activeUnitId === undefined ? 'u1' : context.activeUnitId} activeCallId={context.activeCallId ?? '7'} onActiveCallChange={onActiveCallChange}>
        <SetActiveCallButton call={call} />
      </StatusProvider>
    );

    return { onActiveCallChange };
  };

  it('makes the call active, then asks for the status and a note — not a destination — and saves them for the call', async () => {
    const { onActiveCallChange } = await renderButton(makeCall('8', { Name: 'Medical' }));

    await fireEvent.press(screen.getByTestId('call-detail-set-active'));
    expect(onActiveCallChange).toHaveBeenCalledWith('8');
    expect(useToastStore.getState().toasts[0]).toEqual(expect.objectContaining({ type: 'success', message: 'call_detail.set_active_success' }));

    expect(screen.getByTestId('unit-status-sheet-summary', hidden)).toHaveTextContent('status.selected_destination: #C-8 Medical');
    await fireEvent.press(screen.getByTestId('status-option-31', hidden));
    await fireEvent.press(screen.getByTestId('unit-status-sheet-next', hidden));
    expect(screen.queryByTestId('status-destination-none', hidden)).toBeNull();
    await fireEvent.changeText(screen.getByTestId('unit-status-sheet-note-input', hidden), 'En route from quarters');
    await fireEvent.press(screen.getByTestId('unit-status-sheet-submit', hidden));

    await waitFor(() => expect(saveUnitStatus).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'u1', statusType: '31', note: 'En route from quarters', respondingTo: '8', respondingToType: 2 })));
  });

  it('is not offered for the active call, a closed call, without an active unit or where the shell cannot set the call', async () => {
    await renderButton(makeCall('7'));
    expect(screen.queryByTestId('call-detail-set-active')).toBeNull();

    await renderButton(makeCall('8', { State: 1 }));
    expect(screen.queryByTestId('call-detail-set-active')).toBeNull();

    await renderButton(makeCall('8'), { activeUnitId: null });
    expect(screen.queryByTestId('call-detail-set-active')).toBeNull();

    await renderButton(makeCall('8'), { onActiveCallChange: undefined });
    expect(screen.queryByTestId('call-detail-set-active')).toBeNull();
  });

  it('is Unit only: an app whose status is the member’s own has no active call to set', async () => {
    resetActiveVariantForTests();
    setActiveVariant(parseVariantManifest(responderManifest));
    await renderButton(makeCall('8'));
    expect(screen.queryByTestId('call-detail-set-active')).toBeNull();
    expect(screen.queryByTestId('unit-status-sheet', hidden)).toBeNull();
  });
});
