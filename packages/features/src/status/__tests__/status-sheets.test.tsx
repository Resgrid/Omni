import './test-setup';

import { useAuthStore } from '@resgrid/auth';
import { useCallsStore, usePersonnelStatusStore, usePersonnelStore, usePoisStore, useUnitRolesStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { type CallResultData, type PersonnelInfoResultData, type StatusesResultData, type UnitResultData, type UnitTypeStatusResultData } from '@resgrid/models';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { CurrentStatusBadge } from '../components/current-status-badge';
import { PersonnelStatusSheet } from '../components/personnel-status-sheet';
import { UnitStatusSheet } from '../components/unit-status-sheet';
import { ActionBaseTypes, StaffingBaseTypes } from '../lib/base-types';
import { StatusProvider } from '../status-context';

const mockAcquireLocationFix = jest.fn();
jest.mock('@resgrid/location', () => ({
  acquireLocationFix: () => mockAcquireLocationFix(),
  getLocationFixErrorMessage: (outcome: string) => `location.${outcome}`,
}));

const mockCapabilities = { status: { subject: 'personnel', onBehalf: false, staffing: true } };
jest.mock('@resgrid/config', () => ({
  ...jest.requireActual('@resgrid/config'),
  useCapability: (key: keyof typeof mockCapabilities) => mockCapabilities[key],
}));

const q = { includeHiddenElements: true } as const;

const option = (Id: number, Text: string, extra: Partial<StatusesResultData> = {}): StatusesResultData => ({
  Id,
  Type: 0,
  StateId: 0,
  Text,
  BColor: '#000000',
  Color: '#ffffff',
  Gps: false,
  Note: 0,
  Detail: 0,
  ...extra,
});

const saveUnitStatus = jest.fn(async () => ({ outcome: 'queued' as const, id: 'evt-1' }));
const setStatus = jest.fn(async () => ({ outcome: 'sent' as const, id: 'evt-2' }));
const setStaffing = jest.fn(async () => ({ outcome: 'sent' as const, id: 'evt-3' }));

beforeEach(() => {
  saveUnitStatus.mockClear();
  setStatus.mockClear();
  setStaffing.mockClear();
  mockAcquireLocationFix.mockReset();

  useUnitsStore.setState({
    units: [{ UnitId: 'u1', Name: 'Engine 1', Type: 'Engine', CustomStatusSetId: '5' } as UnitResultData],
    unitTypeStatuses: [
      { UnitType: '0', StatusId: '0', Statuses: [option(0, 'Available')] },
      { UnitType: 'Engine', StatusId: '5', Statuses: [option(30, 'In Quarters', { BaseType: ActionBaseTypes.InQuarters }), option(31, 'Staged', { Gps: true, BaseType: ActionBaseTypes.Staging })] },
    ] as UnitTypeStatusResultData[],
    fetchUnits: jest.fn(async () => undefined),
  });
  useUnitStatusStore.setState({
    destinationsByUnit: { u1: { calls: [{ CallId: '100', Name: 'Fire', Number: '100' } as CallResultData], stations: [], pois: [], poiTypes: [], statuses: [], fetchedAt: Date.now() } },
    currentStatusByUnit: {},
    fetchDestinationData: jest.fn(async () => undefined),
    fetchCurrentStatus: jest.fn(async () => undefined),
    saveUnitStatus,
  });
  useUnitRolesStore.setState({ assignmentsByUnit: { u1: [{ UnitId: 'u1', UnitRoleId: 'r1', Name: 'Driver', UserId: 'user-9', FullName: 'Pat', UpdatedOn: '' }] } });

  useAuthStore.setState({ userId: 'me' });
  usePersonnelStore.setState({
    statusOptions: [option(1, 'Not Responding'), option(2, 'Responding', { Detail: 2 })],
    staffingOptions: [option(0, 'Available', { BaseType: StaffingBaseTypes.Available }), option(5, 'Off Duty', { BaseType: StaffingBaseTypes.OffDuty })],
    groups: [],
    personnel: [{ UserId: 'other', FirstName: 'Sam', LastName: 'Lee', StatusId: '1', StatusBaseType: ActionBaseTypes.NotResponding } as PersonnelInfoResultData],
    fetchStatusOptions: jest.fn(async () => undefined),
    fetchGroups: jest.fn(async () => undefined),
  });
  usePersonnelStatusStore.setState({ currentStatus: null, currentStaffing: null, setStatus, setStaffing, fetchCurrentStatus: jest.fn(async () => undefined), fetchCurrentStaffing: jest.fn(async () => undefined) });
  useCallsStore.setState({ calls: [], fetchCalls: jest.fn(async () => undefined) });
  usePoisStore.setState({ destinationPois: [], fetchDestinationPois: jest.fn(async () => undefined) });
});

describe('UnitStatusSheet', () => {
  it("offers the unit type's custom set and saves through the outbox with the crew and the active call", async () => {
    render(
      <StatusProvider activeUnitId="u1" activeCallId="100">
        <UnitStatusSheet isOpen onClose={jest.fn()} />
      </StatusProvider>
    );

    expect(screen.queryByTestId('status-option-0', q)).toBeNull();
    fireEvent.press(screen.getByTestId('status-option-30', q));
    fireEvent.press(screen.getByTestId('unit-status-sheet-submit', q));

    await waitFor(() => expect(saveUnitStatus).toHaveBeenCalledWith({ unitId: 'u1', statusType: '30', note: '', respondingTo: '100', respondingToType: 2, roles: [{ roleId: 'r1', userId: 'user-9', name: 'Driver' }] }));
    expect(mockAcquireLocationFix).not.toHaveBeenCalled();
  });

  it('takes a live fix for a GPS-required status and refuses it without one', async () => {
    mockAcquireLocationFix.mockResolvedValueOnce({ outcome: 'permission-denied', location: null });
    render(
      <StatusProvider activeUnitId="u1">
        <UnitStatusSheet isOpen onClose={jest.fn()} />
      </StatusProvider>
    );

    fireEvent.press(screen.getByTestId('status-option-31', q));
    fireEvent.press(screen.getByTestId('unit-status-sheet-submit', q));

    await waitFor(() => expect(screen.getByTestId('unit-status-sheet-error', q)).toHaveTextContent('location.permission-denied'));
    expect(saveUnitStatus).not.toHaveBeenCalled();
  });

  it('never sends the dispatcher position or changes the active call on behalf of a unit', async () => {
    const onActiveCallChange = jest.fn();
    render(
      <StatusProvider onActiveCallChange={onActiveCallChange}>
        <UnitStatusSheet isOpen onClose={jest.fn()} unitId="u1" isOnBehalf />
      </StatusProvider>
    );

    expect(screen.getByTestId('unit-status-sheet-on-behalf', q)).toHaveTextContent('status.on_behalf_of:Engine 1');
    fireEvent.press(screen.getByTestId('status-option-31', q));
    fireEvent.press(screen.getByTestId('unit-status-sheet-submit', q));

    await waitFor(() => expect(saveUnitStatus).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'u1', statusType: '31', location: null, respondingTo: '' })));
    expect(mockAcquireLocationFix).not.toHaveBeenCalled();
    expect(onActiveCallChange).not.toHaveBeenCalled();
  });
});

describe('PersonnelStatusSheet', () => {
  it("sets the signed-in member's own status without a user id", async () => {
    render(<PersonnelStatusSheet isOpen onClose={jest.fn()} />);

    fireEvent.press(screen.getByTestId('status-option-1', q));
    fireEvent.press(screen.getByTestId('personnel-status-sheet-submit', q));

    await waitFor(() => expect(setStatus).toHaveBeenCalledWith({ statusType: '1', note: '', respondingTo: '', respondingToType: null }));
  });

  it("sets another member's status and staffing on their behalf (Dispatch)", async () => {
    render(<PersonnelStatusSheet isOpen onClose={jest.fn()} userId="other" />);

    expect(screen.getByTestId('status-option-1', q).props.accessibilityLabel).toBe('Not Responding, status.current');
    fireEvent.press(screen.getByTestId('personnel-status-sheet-tab-staffing', q));
    fireEvent.press(screen.getByTestId('staffing-option-5', q));
    fireEvent.press(screen.getByTestId('personnel-status-sheet-submit', q));

    await waitFor(() => expect(setStaffing).toHaveBeenCalledWith({ userId: 'other', staffingType: '5', note: '' }));
  });
});

describe('CurrentStatusBadge', () => {
  it('reads availability from the BaseType, not the status id or text', () => {
    // Id 2 is the built-in "Responding" id and the text says "Available" — the meaning says committed.
    render(<CurrentStatusBadge text="Available" color="#00ff00" baseType={ActionBaseTypes.OnScene} showAvailability />);
    expect(screen.getByTestId('current-status-badge-availability')).toHaveTextContent('status.availability.committed');
  });

  it('shows a pending marker while a newer status waits to sync', () => {
    render(<CurrentStatusBadge text="Available" pendingText="Responding" />);
    expect(screen.getByText('Responding')).toBeTruthy();
    expect(screen.getByTestId('current-status-badge-pending')).toBeTruthy();
  });
});
