// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import '../../unit-status/__tests__/test-setup';

import { terminologyStore } from '@resgrid/auth';
import { useInventoryStore, useUnitsStore } from '@resgrid/data';
import { StatusProvider } from '@resgrid/features/status';
import { type InventoryCount, type InventoryCountDetail, InventoryCountStatus, type InventoryFieldAccess, type UnitResultData } from '@resgrid/models';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateUnitVariant, hidden } from '../../unit-status/__tests__/test-helpers';
import { clampQuantity, contentOf, groupEquipment, inventoryErrorKey, isComplete, orderLocations, parseQuantityText, pendingObservations, variances } from '../lib/count';
import { inventoryRoutes, readInventoryParam } from '../routes';
import InventoryCountScreen from '../screens/inventory-count';
import InventoryHomeScreen from '../screens/inventory-home';

const access = (overrides: Partial<InventoryFieldAccess> = {}): InventoryFieldAccess => ({
  Enabled: true,
  Migrated: true,
  CanCount: true,
  CanIssue: false,
  CanTransfer: false,
  UnitLocations: [
    { Id: 'cab', Name: 'Cab', LocationType: 4, IsRoot: false, ParentLocationId: 'root' },
    { Id: 'root', Name: 'E1 location', LocationType: 2, IsRoot: true },
  ],
  ...overrides,
});

const line = (Id: string, overrides: Partial<InventoryCountDetail['Lines'][number]> = {}) => ({
  Id,
  Revision: 1,
  CountId: 'ct-1',
  ItemId: `item-${Id}`,
  LocationId: 'root',
  ExpectedQuantity: 4,
  CountedQuantity: null,
  Content: JSON.stringify({ ItemName: `Item ${Id}`, UnitOfMeasure: 'ea' }),
  ...overrides,
});

const countRow = (Id: string, Status: number = InventoryCountStatus.Draft): InventoryCount => ({
  Id,
  Revision: 3,
  Status,
  SnapshotOn: '2026-11-01T10:00:00Z',
  LocationId: 'root',
  Content: JSON.stringify({ Name: `Count ${Id}` }),
});

const detail = (
  Status: number = InventoryCountStatus.Draft,
  lines = [line('l1'), line('l2', { AssetId: 'a1', ExpectedQuantity: 1, Content: JSON.stringify({ ItemName: 'Defib', SerialNumber: 'SN-9' }) })]
): InventoryCountDetail => ({
  Count: countRow('ct-1', Status),
  Lines: lines,
});

const store = {
  fetchAccess: jest.fn(async () => undefined),
  fetchEquipment: jest.fn(async () => undefined),
  fetchCounts: jest.fn(async () => undefined),
  fetchCount: jest.fn(async () => null),
  startCount: jest.fn(async () => detail()),
  saveCount: jest.fn(async () => ({ outcome: 'sent' as const, id: 'evt-1' })),
  completeCount: jest.fn(async () => ({ AwaitingWitness: false })),
  cancelCount: jest.fn(async () => true),
};

const renderWithUnit = (node: React.ReactElement, activeUnitId: string | null = '10') => render(<StatusProvider activeUnitId={activeUnitId}>{node}</StatusProvider>);

beforeEach(() => {
  activateUnitVariant();
  Object.values(store).forEach((fn) => fn.mockClear());
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  terminologyStore.setState({ names: {} });
  useUnitsStore.setState({ units: [{ UnitId: '10', Name: 'Engine 1' } as UnitResultData], fetchUnits: jest.fn(async () => undefined) });
  useInventoryStore.setState({
    ...store,
    accessByUnit: { '10': access() },
    equipmentByUnit: {
      '10': [
        { Stock: { Id: 'st1', Revision: 1, ItemId: 'i1', LocationId: 'cab', Quantity: 6 }, ItemName: 'Gloves', Issuances: [] },
        { Asset: { Id: 'as1', Revision: 1, ItemId: 'i2', Status: 3, CurrentLocationId: 'root', Content: JSON.stringify({ SerialNumber: 'SN-1' }) }, ItemName: 'Radio', Issuances: [] },
      ],
    },
    countsByUnit: { '10': [countRow('ct-1'), countRow('ct-0', InventoryCountStatus.Completed)] },
    countsById: {},
    observedByCount: {},
    completionIdByCount: {},
    loading: {},
    errors: {},
    actionError: null,
  });
});

describe('inventory helpers', () => {
  it('parses row content defensively (withheld content stays blank)', () => {
    expect(contentOf('{"Name":"Check"}')).toEqual({ Name: 'Check' });
    expect(contentOf('REDACTED')).toEqual({});
    expect(contentOf('{broken')).toEqual({});
    expect(contentOf('[1]')).toEqual({});
  });

  it('orders the unit location first and groups equipment by location', () => {
    expect(orderLocations(access().UnitLocations).map((location) => location.Id)).toEqual(['root', 'cab']);
    const groups = groupEquipment(useInventoryStore.getState().equipmentByUnit['10'], 'Item');
    expect(groups.cab[0]).toMatchObject({ name: 'Gloves', quantity: 6, assetStatus: null });
    expect(groups.root[0]).toMatchObject({ name: 'Radio', quantity: 1, serial: 'SN-1', assetStatus: 3 });
  });

  it('works out counted values, completeness, differences and the lines to save', () => {
    const lines = [line('a', { CountedQuantity: 4 }), line('b'), line('c', { CountedQuantity: 2 })];
    const observed = { b: 3, c: 2 };
    expect(isComplete(lines, observed)).toBe(true);
    expect(isComplete(lines, {})).toBe(false);
    expect(variances(lines, observed).map((row) => row.Id)).toEqual(['b', 'c']);
    expect(pendingObservations(lines, observed)).toEqual([{ Id: 'b', Quantity: 3 }]);
  });

  it('clamps quantities: never negative, assets 0 or 1, decimals kept', () => {
    expect(clampQuantity({ AssetId: null }, -2)).toBe(0);
    expect(clampQuantity({ AssetId: 'a' }, 3)).toBe(1);
    expect(clampQuantity({ AssetId: 'a' }, 0.4)).toBe(0);
    expect(clampQuantity({ AssetId: null }, 2.1234567)).toBe(2.123457);
    expect(parseQuantityText('2,5')).toBe(2.5);
    expect(parseQuantityText('')).toBeNull();
    expect(parseQuantityText('abc')).toBeNull();
  });

  it('maps server refusals to inventory error keys', () => {
    expect(inventoryErrorKey({ code: 'rejected', messageKey: '', status: 409, problemType: 'inventory_CountSnapshotChanged' })).toBe('inventory.errors.CountSnapshotChanged');
    expect(inventoryErrorKey({ code: 'forbidden', messageKey: '', status: 403, problemType: 'protected_data_required' })).toBe('inventory.errors.locked');
    expect(inventoryErrorKey({ code: 'forbidden', messageKey: '', status: 403 })).toBe('inventory.errors.PermissionRequired');
    expect(inventoryErrorKey({ code: 'conflict', messageKey: '', status: 409 })).toBe('inventory.errors.CountStateConflict');
    expect(inventoryErrorKey({ code: 'network', messageKey: '' })).toBe('inventory.errors.retry');
    expect(inventoryErrorKey(null)).toBe('inventory.errors.retry');
  });

  it('builds safe count routes', () => {
    expect(inventoryRoutes.count('ct-1')).toBe('/inventory/count/ct-1');
    expect(() => inventoryRoutes.count('../x')).toThrow();
    expect(readInventoryParam(['ct-1'])).toBe('ct-1');
    expect(readInventoryParam('a/b')).toBeNull();
  });
});

describe('InventoryHomeScreen', () => {
  it('asks for an active unit first', () => {
    renderWithUnit(<InventoryHomeScreen />, null);
    expect(screen.getByTestId('inventory-no-unit')).toBeTruthy();
  });

  it('shows the unit’s equipment by compartment, recent counts and loads them for counters', async () => {
    renderWithUnit(<InventoryHomeScreen />);
    expect(screen.getByTestId('inventory-heading')).toHaveTextContent('inventory.titleFor:Engine 1');
    expect(store.fetchAccess).toHaveBeenCalledWith('10', { bypassCache: false });
    await waitFor(() => expect(store.fetchCounts).toHaveBeenCalledWith('10', ['root', 'cab']));
    expect(within(screen.getByTestId('inventory-location-cab')).getByText('Gloves')).toBeTruthy();
    expect(within(screen.getByTestId('inventory-item-as1')).getByText('inventory.assetStatus.3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('inventory-count-ct-1'));
    expect(router.push).toHaveBeenCalledWith('/inventory/count/ct-1');
  });

  it('uses the department’s own name for inventory', () => {
    terminologyStore.setState({ names: { 'module.inventory': 'Equipment' } });
    renderWithUnit(<InventoryHomeScreen />);
    expect(screen.getByTestId('inventory-heading')).toHaveTextContent('Equipment · Engine 1');
  });

  it('starts a count of the chosen compartment and opens it', async () => {
    renderWithUnit(<InventoryHomeScreen />);
    fireEvent.press(screen.getByTestId('inventory-location-option-cab'));
    fireEvent.press(screen.getByTestId('inventory-start'));
    await waitFor(() => expect(store.startCount).toHaveBeenCalledWith(expect.objectContaining({ LocationId: 'cab', IncludeCatalogItems: false, IncludeChildLocations: true })));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/inventory/count/ct-1'));
  });

  it('hides counting from crews without Adjust Inventory and lists no counts for them', () => {
    useInventoryStore.setState({ accessByUnit: { '10': access({ CanCount: false }) } });
    renderWithUnit(<InventoryHomeScreen />);
    expect(screen.queryByTestId('inventory-start-count')).toBeNull();
    expect(screen.getByText('inventory.cannotCount')).toBeTruthy();
    expect(store.fetchCounts).not.toHaveBeenCalled();
  });

  it('explains a department where inventory is off or not set up yet', () => {
    useInventoryStore.setState({ accessByUnit: { '10': access({ Enabled: false }) } });
    renderWithUnit(<InventoryHomeScreen />);
    expect(screen.getByText('inventory.disabled')).toBeTruthy();
    expect(screen.queryByTestId('inventory-start-count')).toBeNull();
  });

  it('marks counts with values not saved yet', () => {
    useInventoryStore.setState({ observedByCount: { 'ct-1': { l1: 2 } } });
    renderWithUnit(<InventoryHomeScreen />);
    expect(screen.getByTestId('inventory-count-ct-1-unsaved')).toHaveTextContent('inventory.unsaved:1');
  });
});

describe('InventoryCountScreen', () => {
  const open = async (status: number = InventoryCountStatus.Draft) => {
    useInventoryStore.setState({ countsById: { 'ct-1': detail(status) } });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'ct-1' });
    const view = renderWithUnit(<InventoryCountScreen />);
    // Let the on-open reread settle (it updates screen state).
    await act(async () => {
      await Promise.resolve();
    });
    return view;
  };

  it('lists the lines by compartment and keeps entered values on the device', async () => {
    await open();
    expect(store.fetchCount).toHaveBeenCalledWith('ct-1', { bypassCache: true });
    expect(screen.getByTestId('inventory-count-summary')).toHaveTextContent('inventory.countStatus.0 · inventory.progress:0,2 · inventory.differences:0');
    fireEvent.press(screen.getByTestId('inventory-more-l1'));
    expect(useInventoryStore.getState().observedByCount['ct-1']).toEqual({ l1: 5 });
    fireEvent.press(screen.getByTestId('inventory-missing-l2'));
    expect(useInventoryStore.getState().observedByCount['ct-1']).toEqual({ l1: 5, l2: 0 });
    fireEvent.changeText(screen.getByTestId('inventory-quantity-l1'), '3,5');
    expect(useInventoryStore.getState().observedByCount['ct-1'].l1).toBe(3.5);
    expect(screen.getByTestId('inventory-count-summary')).toHaveTextContent(/inventory\.differences:2$/);
    expect(screen.getByTestId('inventory-count-unsaved')).toHaveTextContent('inventory.unsaved:2');
  });

  it('saves progress through the outbox with the count revision and only the changed lines', async () => {
    await open();
    fireEvent.press(screen.getByTestId('inventory-matches-l1'));
    fireEvent.press(screen.getByTestId('inventory-save'));
    await waitFor(() => expect(store.saveCount).toHaveBeenCalledWith('ct-1', { CountId: 'ct-1', Revision: 3, Lines: [{ Id: 'l1', Quantity: 4 }] }));
  });

  it('does not complete while offline: the values stay queued on the device', async () => {
    store.saveCount.mockResolvedValueOnce({ outcome: 'queued' as never, id: 'evt-2' });
    await open();
    fireEvent.press(screen.getByTestId('inventory-matches-l1'));
    fireEvent.press(screen.getByTestId('inventory-present-l2'));
    fireEvent.press(screen.getByTestId('inventory-complete'));
    fireEvent.press(screen.getByTestId('inventory-complete-dialog-confirm', hidden));
    await waitFor(() => expect(store.saveCount).toHaveBeenCalled());
    expect(store.completeCount).not.toHaveBeenCalled();
  });

  it('completes with one request id after saving, then rereads the count', async () => {
    await open();
    useInventoryStore.setState({ completionIdByCount: { 'ct-1': 'req-1' } });
    fireEvent.press(screen.getByTestId('inventory-matches-l1'));
    fireEvent.press(screen.getByTestId('inventory-present-l2'));
    fireEvent.press(screen.getByTestId('inventory-complete'));
    fireEvent.press(screen.getByTestId('inventory-complete-dialog-confirm', hidden));
    await waitFor(() => expect(store.completeCount).toHaveBeenCalledWith({ CountId: 'ct-1', Revision: 3, RequestId: 'req-1' }));
    expect(store.saveCount).toHaveBeenCalled();
    await waitFor(() => expect(store.fetchCount).toHaveBeenCalledTimes(2));
  });

  it('keeps Complete disabled until every line is counted', async () => {
    await open();
    expect(screen.getByTestId('inventory-complete')).toBeDisabled();
  });

  it('cancels after confirming and goes back', async () => {
    await open();
    fireEvent.press(screen.getByTestId('inventory-cancel'));
    fireEvent.press(screen.getByTestId('inventory-cancel-dialog-confirm', hidden));
    await waitFor(() => expect(store.cancelCount).toHaveBeenCalledWith({ CountId: 'ct-1', Revision: 3 }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('is read-only once completed and says when a witness is needed', async () => {
    const { unmount } = await open(InventoryCountStatus.Completed);
    expect(screen.getByTestId('inventory-count-completed')).toBeTruthy();
    expect(screen.queryByTestId('inventory-save')).toBeNull();
    unmount();
    await open(InventoryCountStatus.AwaitingWitness);
    expect(screen.getByTestId('inventory-count-witness')).toBeTruthy();
  });

  it('reports a count that cannot be loaded', async () => {
    useInventoryStore.setState({ errors: { count: { code: 'network', messageKey: 'errors.data.network' } } });
    renderWithUnit(<InventoryCountScreen countId="ct-404" />);
    await waitFor(() => expect(screen.getByTestId('inventory-count-missing')).toBeTruthy());
  });
});
