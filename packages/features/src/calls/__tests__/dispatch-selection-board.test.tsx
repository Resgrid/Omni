import './test-setup';

import { boardKeyFor, useDispatchBoardStore } from '@resgrid/data';
import { EtaSource, type NearestUnitBoard, type NearestUnitResult, UnitPositionSource } from '@resgrid/models';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { DispatchSelectionModal } from '../components/dispatch-selection';
import { EMPTY_DISPATCH_SELECTION } from '../lib/call-form';
import { activateVariant, hidden, setRights } from './test-utils';

const CALL = { latitude: 51.05, longitude: 3.72 };

// SAFETY: the picker reads only these fields of the new-call recipients.
const recipients = {
  personnel: [
    { UserId: 'busy', FirstName: 'Bo', LastName: 'Busy', GroupName: 'Gent', Status: 'Responding', StatusBaseType: 2, Roles: [] },
    { UserId: 'free', FirstName: 'Fay', LastName: 'Free', GroupName: 'Gent', Status: 'Available', StatusBaseType: 0, Roles: ['Medic'] },
  ],
  groups: [],
  roles: [],
  units: [
    { UnitId: '4', Name: 'ZW Gent 4', Type: 'ZW 112', GroupName: 'Gent' },
    { UnitId: '7', Name: 'ZW Gent 7', Type: 'ZW 112', GroupName: 'Gent' },
    { UnitId: '1', Name: 'ZW Gavere', Type: 'ZW 112', GroupName: 'Gavere' },
    { UnitId: '9', Name: 'Out of scope', Type: 'ZW 112', GroupName: 'Elsewhere' },
  ],
} as never;

const unit = (overrides: Partial<NearestUnitResult>): NearestUnitResult => ({
  UnitId: 1,
  Name: 'Unit',
  IsAvailable: true,
  PositionIsStale: false,
  PositionSource: UnitPositionSource.Station,
  LocationHidden: false,
  EtaSource: EtaSource.Road,
  TurnoutSeconds: 60,
  Crew: [],
  CrewCount: 0,
  CrewAvailableCount: 0,
  OnShiftCount: 0,
  ...overrides,
});

// Core's order, to the second: Gavere 9:00, Gent 4 16:35, Gent 7 17:10 (nearer, but slower by road).
const board: NearestUnitBoard = {
  Latitude: CALL.latitude,
  Longitude: CALL.longitude,
  GeneratedOn: '2026-11-13T06:00:00Z',
  IsDepartmentWide: true,
  Notes: [],
  Units: [
    unit({ UnitId: 1, Name: 'ZW Gavere', DistanceMeters: 3800, EtaSeconds: 480, ResponseSeconds: 540, Crew: ['Snoeck'] }),
    unit({ UnitId: 4, Name: 'ZW Gent 4', DistanceMeters: 12600, EtaSeconds: 935, ResponseSeconds: 995 }),
    unit({ UnitId: 7, Name: 'ZW Gent 7', DistanceMeters: 10000, EtaSeconds: 970, ResponseSeconds: 1030, StatusText: 'Standplaats', StatusColor: '#ff0000' }),
  ],
  Personnel: [
    {
      UserId: 'free',
      Name: 'Fay Free',
      IsAvailable: true,
      IsOnShift: true,
      Roles: ['Medic'],
      LocationIsStale: true,
      LocationTimestamp: null,
      LocationHidden: false,
      DistanceMeters: 2000,
      EtaSeconds: 301,
      EtaSource: EtaSource.Estimated,
    },
    { UserId: 'busy', Name: 'Bo Busy', IsAvailable: false, IsOnShift: true, Roles: [], LocationIsStale: false, LocationHidden: false, DistanceMeters: 500, EtaSeconds: 60, EtaSource: EtaSource.Road },
  ],
};

const mockFetchNearestBoard = jest.fn(async () => undefined);

const rowOrder = (section: 'users' | 'units') => screen.getAllByTestId(new RegExp(`^dispatch-option-${section}-[^-]+$`), hidden).map((node) => String(node.props.testID).replace(`dispatch-option-${section}-`, ''));

const open = (props: Partial<React.ComponentProps<typeof DispatchSelectionModal>> = {}) =>
  render(<DispatchSelectionModal isOpen onClose={jest.fn()} onConfirm={jest.fn()} recipients={recipients} value={EMPTY_DISPATCH_SELECTION} callLocation={CALL} {...props} />);

beforeEach(() => {
  activateVariant('dispatch');
  setRights({});
  mockFetchNearestBoard.mockClear();
  useDispatchBoardStore.setState({ board, boardKey: boardKeyFor(CALL.latitude, CALL.longitude), isBoardLoading: false, boardError: null, fetchNearestBoard: mockFetchNearestBoard });
});

describe('dispatch picker with the nearest-unit board (Dispatch)', () => {
  it('asks for the board at the call location and lists units in its order, the rest by name', async () => {
    await open();

    expect(mockFetchNearestBoard).toHaveBeenCalledWith(51.05, 3.72);
    expect(rowOrder('units')).toEqual(['1', '4', '7', '9']);
  });

  it('badges the closest available, shows the ranked time to the second, and the run card picks', async () => {
    await open({ recommended: { units: ['7'], users: [] } });

    expect(screen.getByTestId('dispatch-option-units-1-badge-nearest', hidden)).toBeTruthy();
    expect(screen.getByTestId('dispatch-option-units-7-badge-nearest', hidden)).toBeTruthy();
    expect(screen.getByTestId('dispatch-option-units-7-badge-runCard', hidden)).toBeTruthy();
    expect(screen.queryByTestId('dispatch-option-units-9-badge-nearest', hidden)).toBeNull();
    // Turnout plus travel, as Core ranks it: 16:35 and 17:10 no longer both read "17 min".
    expect(screen.getByTestId('dispatch-option-units-4-metric', hidden).props.children).toBe('12.6 km · 16:35 min');
    expect(screen.getByTestId('dispatch-option-units-7-metric', hidden).props.children).toBe('10.0 km · 17:10 min');
    expect(screen.getByTestId('dispatch-option-users-free-metric', hidden).props.children).toBe('2.0 km · ~5:01 min');
    expect(screen.getByTestId('dispatch-option-users-free-note', hidden)).toBeTruthy();
  });

  it('sorts by name on request and hides the unavailable unless picked', async () => {
    await open({ value: { ...EMPTY_DISPATCH_SELECTION, users: ['busy'] } });

    await fireEvent.press(screen.getByText('calls.dispatch_board.sort_name', hidden));
    expect(rowOrder('units')).toEqual(['9', '1', '4', '7']);

    await fireEvent(screen.getByTestId('dispatch-selection-available-only', hidden), 'valueChange', true);
    // Bo is busy but picked: a pick never disappears from view.
    expect(rowOrder('users')).toEqual(['busy', 'free']);
  });

  it('hides the unavailable who are not picked', async () => {
    await open();
    await fireEvent(screen.getByTestId('dispatch-selection-available-only', hidden), 'valueChange', true);

    expect(rowOrder('users')).toEqual(['free']);
  });

  it('ignores a board for another spot and asks the dispatcher for a location', async () => {
    await open({ callLocation: { latitude: 50.9, longitude: 3.6 } });

    expect(screen.queryByTestId('dispatch-option-units-1-metric', hidden)).toBeNull();
    expect(rowOrder('units')).toEqual(['9', '1', '4', '7']);

    await open({ callLocation: null });
    expect(screen.getAllByText('calls.dispatch_board.set_location_to_rank', hidden).length).toBeGreaterThan(0);
  });

  it('keeps the plain picker in apps without the board', async () => {
    activateVariant('responder');
    await open();

    expect(mockFetchNearestBoard).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dispatch-selection-board', hidden)).toBeNull();
    expect(screen.queryByTestId('dispatch-option-units-1-metric', hidden)).toBeNull();
  });
});
