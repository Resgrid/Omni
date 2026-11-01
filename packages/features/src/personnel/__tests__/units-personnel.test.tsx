import '../../status/__tests__/test-setup';

import { securityStore } from '@resgrid/auth';
import { usePersonnelStatusStore, usePersonnelStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { ActionBaseTypes, StaffingBaseTypes } from '@resgrid/features/status';
import { UnitDetailScreen, UnitsListScreen, useUnitsViewStore } from '@resgrid/features/units';
import { type DepartmentRightsResultData, type PersonnelInfoResultData, type UnitInfoResultData } from '@resgrid/models';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { usePersonnelViewStore } from '../hooks/use-personnel-view-store';
import { filterPersonnel } from '../lib/personnel-filters';
import PersonnelDetailScreen from '../screens/personnel-detail';
import PersonnelListScreen from '../screens/personnel-list';

const mockCapabilities = { status: { subject: 'personnel', onBehalf: true, staffing: true } };
jest.mock('@resgrid/config', () => ({
  ...jest.requireActual('@resgrid/config'),
  useCapability: (key: keyof typeof mockCapabilities) => mockCapabilities[key],
}));

const unit = (UnitId: string, Name: string, extra: Partial<UnitInfoResultData> = {}): UnitInfoResultData =>
  ({ UnitId, Name, Type: 'Engine', Roles: [], CurrentStatus: 'Available', CurrentStatusColor: '#00aa00', ...extra }) as UnitInfoResultData;
const person = (UserId: string, FirstName: string, extra: Partial<PersonnelInfoResultData> = {}): PersonnelInfoResultData =>
  ({
    UserId,
    FirstName,
    LastName: 'Smith',
    Roles: [],
    EmailAddress: `${FirstName.toLowerCase()}@example.org`,
    MobilePhone: '555-0100',
    IdentificationNumber: 'ID-7',
    Status: 'Available',
    ...extra,
  }) as PersonnelInfoResultData;

const setRights = (canViewPII: boolean) => securityStore.setState({ rights: { CanViewPII: canViewPII } as DepartmentRightsResultData });

beforeEach(() => {
  (router.push as jest.Mock).mockClear();
  useUnitsViewStore.setState({ query: '', selectedFilters: [], availability: 'all' });
  usePersonnelViewStore.setState({ query: '', selectedFilters: [], availability: 'all' });
  useUnitsStore.setState({
    unitInfos: [
      unit('u1', 'Engine 1', { CurrentStatusBaseType: ActionBaseTypes.InQuarters }),
      unit('u2', 'Medic 2', { CurrentStatus: 'Transporting', CurrentStatusBaseType: ActionBaseTypes.Transporting, CurrentDestinationName: 'General Hospital' }),
    ],
    filterOptions: [{ Id: 'G:1', Type: 'Groups', Name: 'Station 1' }],
    fetchUnitInfos: jest.fn(async () => undefined),
    fetchFilterOptions: jest.fn(async () => undefined),
  });
  useUnitStatusStore.setState({ queuedStatuses: {} });
  usePersonnelStore.setState({
    personnel: [person('p1', 'Alex', { StatusBaseType: ActionBaseTypes.Responding, Status: 'Responding' }), person('p2', 'Blair', { StaffingBaseType: StaffingBaseTypes.OffDuty, Staffing: 'Off Duty' })],
    filterOptions: [],
    fetchPersonnel: jest.fn(async () => undefined),
    getPersonnelFilterOptions: jest.fn(async () => undefined),
  });
  usePersonnelStatusStore.setState({ queuedWrites: {} });
});

describe('UnitsListScreen', () => {
  it('filters by availability meaning and search, and opens the unit detail', () => {
    render(<UnitsListScreen />);
    expect(screen.getByTestId('unit-card-u1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('units-availability-committed'));
    expect(screen.queryByTestId('unit-card-u1')).toBeNull();
    expect(screen.getByTestId('unit-card-u2')).toBeTruthy();

    fireEvent.press(screen.getByTestId('units-availability-all'));
    fireEvent.changeText(screen.getByTestId('units-search'), 'engine 1');
    expect(screen.queryByTestId('unit-card-u2')).toBeNull();
    fireEvent.press(screen.getByTestId('unit-card-u1'));
    expect(router.push).toHaveBeenCalledWith('/units/u1');
  });

  it('applies a server filter option through activeFilter', () => {
    render(<UnitsListScreen />);
    fireEvent.press(screen.getByTestId('units-filter-button'));
    fireEvent.press(screen.getByTestId('units-filter-sheet-option-G:1', { includeHiddenElements: true }));
    expect(useUnitsStore.getState().fetchUnitInfos).toHaveBeenLastCalledWith({ activeFilter: 'G:1', bypassCache: false });
  });

  it('marks a unit with a status queued on the device', () => {
    useUnitStatusStore.setState({ queuedStatuses: { e1: { localId: 'e1', unitId: 'u1', statusType: '3', respondingTo: '', respondingToType: null, note: '', createdAt: 1, state: 'queued' } } });
    render(<UnitsListScreen />);
    expect(screen.getByTestId('unit-card-u1-status-pending')).toBeTruthy();
  });
});

describe('UnitDetailScreen', () => {
  it('shows status, destination and the on-behalf status button', () => {
    render(<UnitDetailScreen unitId="u2" />);
    expect(screen.getByTestId('unit-detail-status-availability')).toHaveTextContent('status.availability.committed');
    expect(screen.getByText('General Hospital')).toBeTruthy();
    expect(screen.getByTestId('unit-detail-set-status')).toBeTruthy();
  });

  it('shows not found for an unknown unit', () => {
    useUnitsStore.setState({ unitInfos: [] });
    render(<UnitDetailScreen unitId="missing" />);
    expect(screen.getByTestId('unit-detail-missing')).toBeTruthy();
  });
});

describe('Personnel', () => {
  it('hides email and phone without CanViewPII and never matches them in search', () => {
    setRights(false);
    render(<PersonnelListScreen />);
    expect(screen.queryByTestId('personnel-card-p1-email')).toBeNull();
    expect(screen.queryByTestId('personnel-card-p1-phone')).toBeNull();
    expect(filterPersonnel(usePersonnelStore.getState().personnel, { query: 'alex@example', availability: 'all' }, false)).toHaveLength(0);
  });

  it('shows contact details with CanViewPII', () => {
    setRights(true);
    render(<PersonnelListScreen />);
    expect(screen.getByTestId('personnel-card-p1-email')).toHaveTextContent('alex@example.org');
    expect(filterPersonnel(usePersonnelStore.getState().personnel, { query: 'alex@example', availability: 'all' }, true)).toHaveLength(1);
  });

  it('filters by status meaning and opens the member', () => {
    setRights(true);
    render(<PersonnelListScreen />);
    fireEvent.press(screen.getByTestId('personnel-availability-committed'));
    expect(screen.queryByTestId('personnel-card-p2')).toBeNull();
    fireEvent.press(screen.getByTestId('personnel-card-p1'));
    expect(router.push).toHaveBeenCalledWith('/personnel/p1');
  });

  it('detail hides the contact block without CanViewPII and offers on-behalf status and staffing', () => {
    setRights(false);
    render(<PersonnelDetailScreen userId="p1" />);
    expect(screen.queryByTestId('personnel-detail-contact')).toBeNull();
    expect(screen.queryByText('ID-7')).toBeNull();
    expect(screen.getByTestId('personnel-detail-set-status')).toBeTruthy();
    expect(screen.getByTestId('personnel-detail-set-staffing')).toBeTruthy();
  });

  it('detail shows contact details with CanViewPII', () => {
    setRights(true);
    render(<PersonnelDetailScreen userId="p1" />);
    expect(screen.getByTestId('personnel-detail-contact')).toBeTruthy();
    expect(screen.getByText('ID-7')).toBeTruthy();
  });
});
