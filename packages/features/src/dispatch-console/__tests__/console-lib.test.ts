import '../../calls/__tests__/test-setup';

import { makeCall } from '../../calls/__tests__/test-utils';
import { buildAddResourcesRequest } from '../components/add-resources-sheet';
import { useConsoleStore } from '../hooks/use-console-store';
import { DASHBOARD_VIEW_STORE_NAME, selectCardCollapsed, useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import { commonStatusKey, resolveCommonUnitStatusOptions } from '../lib/bulk-status';
import { filterConsoleCalls, filterConsolePersonnel, filterConsoleUnits, getUnitCrew, isPersonOnCall, isUnitOnCall, plainText } from '../lib/console-filters';
import { resolveConsoleLayout } from '../lib/console-layout';
import { computeConsoleStats } from '../lib/console-stats';

const NOW = Date.parse('2026-10-31T12:00:00Z');

const unit = (UnitId: string, overrides: Record<string, unknown> = {}) =>
  ({
    UnitId,
    Name: `E${UnitId}`,
    Type: 'Engine',
    GroupName: 'Station 1',
    CurrentStatus: 'Available',
    CurrentStatusBaseType: 0,
    CurrentDestinationId: '',
    ActiveCallId: null,
    Roles: [],
    CustomStatusSetId: '',
    ...overrides,
  }) as never;

const person = (UserId: string, overrides: Record<string, unknown> = {}) =>
  ({
    UserId,
    FirstName: 'Pat',
    LastName: UserId,
    GroupName: 'A shift',
    Status: 'Available',
    StatusBaseType: 0,
    Staffing: 'On shift',
    StaffingBaseType: 4,
    StatusDestinationId: '',
    Roles: ['Medic'],
    ...overrides,
  }) as never;

describe('console stats', () => {
  it('counts by BaseType only and keeps scheduled calls out of the active count', () => {
    const calls = [makeCall('1'), makeCall('2', { DispatchedOnUtc: '2026-11-01T09:00:00Z' }), makeCall('3', { State: 1 })];
    const units = [unit('1'), unit('2', { CurrentStatusBaseType: 3 }), unit('3', { CurrentStatus: 'Available', CurrentStatusBaseType: null }), unit('4', { CurrentStatusBaseType: 21 })];
    const personnel = [person('a'), person('b', { StatusBaseType: -1, StaffingBaseType: 5 })];
    expect(computeConsoleStats(calls, units, personnel, NOW)).toEqual({ activeCalls: 1, scheduledCalls: 1, unitsAvailable: 2, personnelAvailable: 1, personnelOnDuty: 1 });
  });
});

describe('console filters', () => {
  const filter = {
    callId: '9',
    dispatches: [
      { Id: '2', Type: 'Unit', Name: 'E2' },
      { Id: 'b', Type: 'User', Name: 'Pat b' },
    ] as never,
  };

  it('shows open, non-scheduled calls matching the search', () => {
    const calls = [makeCall('1', { Name: 'Kitchen fire' }), makeCall('2', { DispatchedOnUtc: '2026-11-01T09:00:00Z' }), makeCall('3', { State: 8 })];
    expect(filterConsoleCalls(calls, '', NOW).map((call) => call.CallId)).toEqual(['1']);
    expect(filterConsoleCalls(calls, 'garage', NOW)).toEqual([]);
  });

  it('decides who is on the filtered call by dispatch or status destination', () => {
    expect(isUnitOnCall({ UnitId: '2', Name: 'X', CurrentDestinationId: '', ActiveCallId: null }, filter)).toBe(true);
    expect(isUnitOnCall({ UnitId: '5', Name: 'e2', CurrentDestinationId: '', ActiveCallId: null }, filter)).toBe(true);
    expect(isUnitOnCall({ UnitId: '6', Name: 'E6', CurrentDestinationId: '9', ActiveCallId: null }, filter)).toBe(true);
    expect(isUnitOnCall({ UnitId: '7', Name: 'E7', CurrentDestinationId: '', ActiveCallId: null }, null)).toBe(false);
    expect(isPersonOnCall({ UserId: 'b', StatusDestinationId: '' }, filter)).toBe(true);
    expect(isPersonOnCall({ UserId: 'c', StatusDestinationId: '9' }, filter)).toBe(true);
  });

  it('filters resources by call, availability and search (roles included)', () => {
    const units = [unit('1'), unit('2', { CurrentStatusBaseType: 3, Roles: [{ RoleId: 'r', RoleName: 'Driver', Name: 'Sam', UserId: 'u' }] })];
    expect(filterConsoleUnits(units, { query: '', availableOnly: true, callFilter: null }).map((row) => row.UnitId)).toEqual(['1']);
    expect(filterConsoleUnits(units, { query: 'sam', availableOnly: false, callFilter: null }).map((row) => row.UnitId)).toEqual(['2']);
    expect(filterConsoleUnits(units, { query: '', availableOnly: false, callFilter: filter }).map((row) => row.UnitId)).toEqual(['2']);
    const personnel = [person('a'), person('b', { StatusBaseType: 3 })];
    expect(filterConsolePersonnel(personnel, { query: 'medic', availableOnly: true, callFilter: null }).map((row) => row.UserId)).toEqual(['a']);
    expect(filterConsolePersonnel(personnel, { query: '', availableOnly: false, callFilter: filter }).map((row) => row.UserId)).toEqual(['b']);
  });

  it('reads crew seats and strips HTML previews', () => {
    expect(
      getUnitCrew({
        Roles: [
          { UserId: 'u', Name: ' Sam ' },
          { UserId: '', Name: '' },
        ] as never,
      })
    ).toEqual({ filled: 1, total: 2, names: ['Sam'] });
    expect(plainText('<p>Smoke &amp; fire</p><br/>showing')).toBe('Smoke & fire showing');
  });
});

describe('layout and bulk statuses', () => {
  it('picks 3/2/1 columns by form factor', () => {
    expect(resolveConsoleLayout({ formFactor: 'desktop', isLandscape: true })).toBe('three-column');
    expect(resolveConsoleLayout({ formFactor: 'wall', isLandscape: true })).toBe('three-column');
    expect(resolveConsoleLayout({ formFactor: 'tablet', isLandscape: true })).toBe('three-column');
    expect(resolveConsoleLayout({ formFactor: 'tablet', isLandscape: false })).toBe('two-column');
    expect(resolveConsoleLayout({ formFactor: 'phone', isLandscape: true })).toBe('single-column');
  });

  it('matches statuses across status sets by meaning, keeping each unit’s own id', () => {
    const sets = [
      {
        UnitType: '0',
        StatusId: '0',
        Statuses: [
          { Id: 1, Text: 'Available', BaseType: 0 },
          { Id: 2, Text: 'Responding', BaseType: 2 },
          { Id: 3, Text: 'Custom', BaseType: -1 },
        ],
      },
      {
        UnitType: 'Ambulance',
        StatusId: '7',
        Statuses: [
          { Id: 70, Text: 'In service', BaseType: 0 },
          { Id: 71, Text: 'custom ', BaseType: null },
        ],
      },
    ] as never;
    const options = resolveCommonUnitStatusOptions([unit('1'), unit('2', { Type: 'Ambulance', CustomStatusSetId: '7' })], sets);
    expect(options.map((option) => option.key)).toEqual(['base:0', 'text:custom']);
    expect(options[0].statusByUnitId).toMatchObject({ '1': { Id: 1 }, '2': { Id: 70 } });
    expect(commonStatusKey({ BaseType: 15, Text: 'At Hospital' })).toBe('base:15');
    expect(resolveCommonUnitStatusOptions([], sets)).toEqual([]);
  });

  it('builds an additive EditCall request for add-resources', () => {
    const call = makeCall('42', { Latitude: '40.1', Longitude: '-105.2', Name: 'Fire', DestinationPoiId: 3 });
    const request = buildAddResourcesRequest(
      call,
      { everyone: false, users: ['u1'], groups: [], roles: [], units: ['1'] },
      { everyone: false, users: [], groups: [], roles: [], units: ['1', '2'] },
      { callFormData: '{"a":1}', unitResponseCodes: '2:5' }
    );
    expect(request).toMatchObject({
      callId: '42',
      name: 'Fire',
      latitude: 40.1,
      longitude: -105.2,
      dispatchUsers: ['u1'],
      dispatchUnits: ['1', '2'],
      callFormData: '{"a":1}',
      unitResponseCodes: '2:5',
      destinationPoiId: 3,
    });
    expect(request).not.toHaveProperty('linkedCallId');
    expect(request).not.toHaveProperty('protocolIds');
  });
});

describe('console view state', () => {
  beforeEach(() => useConsoleStore.setState(useConsoleStore.getInitialState()));

  it('toggles the call filter and surfaces actions', () => {
    expect(useConsoleStore.getState().toggleCallFilter('9')).toBe(true);
    expect(useConsoleStore.getState()).toMatchObject({ selectedCallId: '9', isCallFilterActive: true, activeTab: 'actions' });
    useConsoleStore.getState().setActiveTab('checkins');
    expect(useConsoleStore.getState().toggleCallFilter('9')).toBe(false);
    expect(useConsoleStore.getState()).toMatchObject({ selectedCallId: null, isCallFilterActive: false, activeTab: 'activity' });
  });

  it('selects a unit or a person exclusively and multi-select takes the selected unit along', () => {
    expect(useConsoleStore.getState().selectUnit('1')).toBe(true);
    expect(useConsoleStore.getState().selectPersonnel('a')).toBe(true);
    expect(useConsoleStore.getState().selectedUnitId).toBeNull();
    useConsoleStore.getState().selectUnit('1');
    useConsoleStore.getState().startSelection(['2']);
    expect(useConsoleStore.getState()).toMatchObject({ isSelectionMode: true, selectedUnitIds: ['1', '2'], selectedUnitId: null });
    useConsoleStore.getState().toggleUnitInSelection('1');
    useConsoleStore.getState().addUnitsToSelection(['2', '3']);
    expect(useConsoleStore.getState().selectedUnitIds).toEqual(['2', '3']);
    useConsoleStore.getState().selectUnit('4');
    expect(useConsoleStore.getState()).toMatchObject({ isSelectionMode: false, selectedUnitIds: [], selectedUnitId: '4' });
  });

  it('caps the logs and times radio transmissions', () => {
    for (let index = 0; index < 105; index++) useConsoleStore.getState().addActivity({ type: 'system', action: 'a', description: String(index) });
    expect(useConsoleStore.getState().activityLog).toHaveLength(100);
    expect(useConsoleStore.getState().activityLog[0].description).toBe('104');
    useConsoleStore.getState().startRadioTransmission('u1', 'Pat');
    useConsoleStore.getState().startRadioTransmission('u1', 'Pat');
    expect(useConsoleStore.getState().radioLog).toHaveLength(1);
    useConsoleStore.getState().endRadioTransmission('u1');
    expect(useConsoleStore.getState().radioLog[0]).toMatchObject({ isActive: false, duration: expect.any(Number) });
  });

  it('keeps the legacy persisted view store name and defaults cards to expanded', () => {
    expect(DASHBOARD_VIEW_STORE_NAME).toBe('dashboard-view-storage');
    expect(selectCardCollapsed('map')(useDashboardViewStore.getState())).toBe(false);
    useDashboardViewStore.getState().setCardCollapsed('map', true);
    expect(selectCardCollapsed('map')(useDashboardViewStore.getState())).toBe(true);
    useDashboardViewStore.getState().setCardCollapsed('map', false);
  });
});
