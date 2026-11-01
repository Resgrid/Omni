import '../../status/__tests__/test-setup';

import { usePersonnelStore, useUnitRolesStore, useUnitsStore } from '@resgrid/data';
import { StatusProvider } from '@resgrid/features/status';
import { type ActiveUnitRoleResultData, type PersonnelInfoResultData, type UnitResultData, type UnitRoleResultData } from '@resgrid/models';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { UnitRolesSheet } from '../components/unit-roles-sheet';
import { applyAssignment, buildSetUnitRolesInput, isUnqualifiedForSeat } from '../lib/role-assignments';

const q = { includeHiddenElements: true } as const;

const seat = (UnitRoleId: string, Name: string, extra: Partial<UnitRoleResultData> = {}): UnitRoleResultData => ({ UnitId: 'u1', UnitRoleId, Name, ...extra });
const assigned = (UnitRoleId: string, UserId: string): ActiveUnitRoleResultData => ({ UnitId: 'u1', UnitRoleId, Name: '', UserId, FullName: '', UpdatedOn: '' });
const person = (UserId: string, FirstName: string, Roles: string[] = []): PersonnelInfoResultData => ({ UserId, FirstName, LastName: 'Doe', Roles, GroupName: 'Station 1' }) as PersonnelInfoResultData;

const SEATS = [seat('driver', 'Driver'), seat('officer', 'Officer', { PersonnelRoleRequired: true, PersonnelRoleName: 'Captain' })];

describe('role assignment rules', () => {
  it('moves a person out of the seat they held when assigned to another', () => {
    const server = [assigned('driver', 'a')];
    const pending = applyAssignment([], server, 'officer', 'a');
    expect(pending).toEqual([
      { roleId: 'driver', userId: undefined },
      { roleId: 'officer', userId: 'a' },
    ]);
    expect(buildSetUnitRolesInput('u1', SEATS, pending, server)).toEqual({
      UnitId: 'u1',
      Roles: [
        { RoleId: 'driver', UserId: '', Name: '' },
        { RoleId: 'officer', UserId: 'a', Name: '' },
      ],
    });
  });

  it('flags a person without the personnel role a seat requires', () => {
    expect(isUnqualifiedForSeat(SEATS[1], ['Firefighter'])).toBe(true);
    expect(isUnqualifiedForSeat(SEATS[1], ['captain'])).toBe(false);
    expect(isUnqualifiedForSeat(SEATS[0], [])).toBe(false);
  });
});

describe('UnitRolesSheet', () => {
  const assignRoles = jest.fn(async () => undefined);

  beforeEach(() => {
    assignRoles.mockReset();
    useUnitsStore.setState({ units: [{ UnitId: 'u1', Name: 'Engine 1' } as UnitResultData] });
    useUnitRolesStore.setState({ rolesByUnit: { u1: SEATS }, assignmentsByUnit: { u1: [assigned('driver', 'a')] }, roles: [], fetchAllForUnit: jest.fn(async () => undefined), assignRoles });
    usePersonnelStore.setState({ personnel: [person('a', 'Alex'), person('b', 'Blair', ['Captain'])], fetchPersonnel: jest.fn(async () => undefined) });
  });

  const renderSheet = (onClose = jest.fn()) =>
    render(
      <StatusProvider activeUnitId="u1">
        <UnitRolesSheet isOpen onClose={onClose} />
      </StatusProvider>
    );

  it('shows who sits where and saves a reassignment', async () => {
    const onClose = jest.fn();
    renderSheet(onClose);

    expect(screen.getByTestId('role-assignment-driver-name', q)).toHaveTextContent('Alex Doe');
    expect(screen.getByTestId('role-assignment-officer-name', q)).toHaveTextContent('roles.unassigned');

    fireEvent.press(screen.getByTestId('role-assignment-officer', q));
    expect(screen.getByTestId('role-user-a-elsewhere', q)).toHaveTextContent('Driver');
    expect(screen.getByTestId('role-user-a-unqualified', q)).toBeTruthy();
    fireEvent.press(screen.getByTestId('role-user-b', q));

    fireEvent.press(screen.getByTestId('unit-roles-save', q));
    await waitFor(() =>
      expect(assignRoles).toHaveBeenCalledWith({
        UnitId: 'u1',
        Roles: [
          { RoleId: 'driver', UserId: 'a', Name: '' },
          { RoleId: 'officer', UserId: 'b', Name: '' },
        ],
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('keeps the picks and shows the error when the save fails', async () => {
    assignRoles.mockRejectedValueOnce(new Error('offline'));
    const onClose = jest.fn();
    renderSheet(onClose);

    fireEvent.press(screen.getByTestId('role-assignment-driver', q));
    fireEvent.press(screen.getByTestId('role-user-unassign', q));
    fireEvent.press(screen.getByTestId('unit-roles-save', q));

    await waitFor(() => expect(screen.getByTestId('unit-roles-save-error', q)).toHaveTextContent('roles.save_error'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('role-assignment-driver-name', q)).toHaveTextContent('roles.unassigned');
  });
});
