import '../../status/__tests__/test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import { useWorkOrdersStore } from '@resgrid/data';
import { type WorkOrderDetail, WorkOrderStatus, type WorkOrderSummary } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activeWorkOrderFilterCount, EMPTY_WORK_ORDER_FILTERS, filterWorkOrders } from '../lib/work-order-filters';
import { formatDueDate, missingField, parseHours, transitionNeeds, workOrderErrorCode, workOrderErrorKey } from '../lib/work-order-rules';
import { workOrderRoutes } from '../routes';
import WorkOrderDetailScreen from '../screens/work-order-detail';
import WorkOrderReportScreen from '../screens/work-order-report';
import WorkOrdersScreen from '../screens/work-orders';

const mockPicker = {
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///photo.jpg', mimeType: 'image/jpeg' }] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
};
// Imports are hoisted above `mockPicker`, so the factory delegates lazily.
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: () => mockPicker.requestCameraPermissionsAsync(),
  requestMediaLibraryPermissionsAsync: () => mockPicker.requestMediaLibraryPermissionsAsync(),
  launchCameraAsync: () => mockPicker.launchCameraAsync(),
  launchImageLibraryAsync: () => mockPicker.launchImageLibraryAsync(),
}));

jest.mock('@resgrid/config', () => ({ ...jest.requireActual('@resgrid/config'), getActiveVariant: () => ({ shell: { homeRoute: '/home' } }) }));

const summary = (Id: string, overrides: Partial<WorkOrderSummary> = {}): WorkOrderSummary =>
  ({
    Id,
    Number: `WO-${Id}`,
    Title: `Pump leak ${Id}`,
    Status: WorkOrderStatus.Requested,
    Priority: 1,
    Revision: 3,
    UpdatedOn: '',
    CreatedOn: '',
    DueOn: '2030-05-12T00:00:00',
    UnitId: 7,
    ...overrides,
  }) as WorkOrderSummary;

const detail = (order: WorkOrderSummary, overrides: Partial<WorkOrderDetail> = {}): WorkOrderDetail =>
  ({
    Order: order,
    Input: {
      RequestId: 'req',
      Revision: order.Revision,
      Type: 0,
      Priority: order.Priority,
      Content: { Title: order.Title, Description: 'Leaking at the intake', LocationText: 'Bay 2', SafetyCritical: true, Steps: [{ Text: 'Isolate pump', Completed: false }] },
    },
    CanWrite: true,
    CanManage: false,
    CanEdit: false,
    CanContribute: true,
    CanAccept: true,
    Transitions: [WorkOrderStatus.InProgress, WorkOrderStatus.OnHold, WorkOrderStatus.Completed],
    Activities: [{ Id: 'a1', Type: 2, CreatedOn: '2030-05-10T10:00:00', NewStatus: 1, Note: 'Triaged' }],
    Labor: [{ Id: 'l1', WorkDate: '2030-05-10', Content: { Hours: 1.5 } }],
    Files: [{ Id: 'f1', Name: 'leak.jpg', ContentType: 'image/jpeg', Size: 10 }],
    ...overrides,
  }) as WorkOrderDetail;

const hidden = { includeHiddenElements: true } as const;

let store: Record<string, jest.Mock>;

const enable = (enabled = true) => featureFlagsStore.setState({ flags: { 'Maintenance.WorkOrders': { enabled } }, isLoaded: true } as never);
const toasts = () => useToastStore.getState().toasts.map((toast) => `${toast.type}:${toast.message}`);

beforeEach(() => {
  enable();
  useToastStore.getState().clearToasts();
  (router.push as jest.Mock).mockClear();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void | (() => void)) => React.useEffect(effect, [effect]));
  store = {
    fetchAccess: jest.fn(async () => undefined),
    fetchChoices: jest.fn(async () => undefined),
    fetchWorkOrders: jest.fn(async () => undefined),
    fetchMoreWorkOrders: jest.fn(async () => undefined),
    fetchWorkOrder: jest.fn(async () => null),
    fetchImage: jest.fn(async () => null),
    report: jest.fn(async () => ({ outcome: 'sent' as const, id: 'req-1' })),
    transition: jest.fn(async () => true),
    accept: jest.fn(async () => true),
    comment: jest.fn(async () => true),
    logHours: jest.fn(async () => true),
    attachFile: jest.fn(async () => true),
  };
  useWorkOrdersStore.setState({
    access: { ChecklistsEnabled: true, MaintenanceEnabled: true, ProductName: 'Readiness Pro' },
    choices: { Currency: 'USD', Users: [], Roles: [], Units: [{ Id: '7', Name: 'Engine 7' }], Groups: [{ Id: '2', Name: 'Station 2' }], Assets: [] },
    ordersById: {},
    list: { assignedToMe: true, items: [], page: 0, hasMore: false, canWrite: true, loaded: true },
    imagesById: {},
    queuedReports: {},
    actionError: null,
    loading: {},
    errors: {},
    ...store,
  } as never);
});

describe('work order rules', () => {
  it('asks for the fields each transition requires', () => {
    const base = detail(summary('1', { Status: WorkOrderStatus.InProgress }));
    expect(transitionNeeds(base, WorkOrderStatus.Completed)).toMatchObject({ resolution: true, cause: true, confirmTasks: true, reason: false });
    expect(transitionNeeds(base, WorkOrderStatus.OnHold).reason).toBe(true);
    expect(transitionNeeds(detail(summary('2', { Status: WorkOrderStatus.Closed })), WorkOrderStatus.Accepted).reason).toBe(true);
    expect(missingField(transitionNeeds(base, WorkOrderStatus.Duplicate), { reason: 'dup', resolution: '', cause: '', verification: '', duplicateOf: '', confirmTasks: false })).toBe('duplicateOf');
  });

  it('turns refusals into translatable codes', () => {
    expect(workOrderErrorCode({ code: 'rejected', status: 400, problemType: 'work_order_TasksIncomplete', messageKey: '' })).toBe('TasksIncomplete');
    expect(workOrderErrorCode({ code: 'rejected', status: 400, problemType: 'work_order_Brand_New', messageKey: '' })).toBe('retry');
    expect(workOrderErrorCode({ code: 'rejected', status: 402, messageKey: '' })).toBe('readiness_required');
    expect(workOrderErrorCode({ code: 'conflict', status: 409, messageKey: '' })).toBe('Conflict');
    expect(workOrderErrorCode({ code: 'forbidden', status: 403, problemType: 'protected_data_required', messageKey: '' })).toBe('locked');
    expect(workOrderErrorCode({ code: 'network', messageKey: '' })).toBe('retry');
    expect(workOrderErrorKey('nope')).toBe('workOrders.errors.retry');
  });

  it('parses hours and keeps due dates on their calendar day', () => {
    expect(parseHours('1,5')).toBe(1.5);
    expect(parseHours('0')).toBeNull();
    expect(parseHours('25')).toBeNull();
    expect(parseHours('')).toBeNull();
    expect(formatDueDate('2030-05-12T00:00:00Z', 'en-US')).toBe('May 12, 2030');
    expect(workOrderRoutes.detail('6f1c-1')).toBe('/work-orders/6f1c-1');
    expect(() => workOrderRoutes.detail('../x')).toThrow();
  });
});

describe('work order filters', () => {
  const items = [
    summary('1', { Title: 'Pump leak', Number: 'WO-0042', Status: WorkOrderStatus.InProgress, Priority: 3 }),
    summary('2', { Title: 'Ladder rung bent', Number: 'WO-0043', Status: WorkOrderStatus.Closed, Priority: 1 }),
    summary('3', { Title: 'Pump packing', Number: 'WO-0101', Status: WorkOrderStatus.Requested, Priority: 0 }),
  ];
  const ids = (filters: Partial<typeof EMPTY_WORK_ORDER_FILTERS>) => filterWorkOrders(items, { ...EMPTY_WORK_ORDER_FILTERS, ...filters }).map((order) => order.Id);

  it('searches every word in the title or number', () => {
    expect(ids({})).toEqual(['1', '2', '3']);
    expect(ids({ query: 'PUMP' })).toEqual(['1', '3']);
    expect(ids({ query: 'pump 0101' })).toEqual(['3']);
    expect(ids({ query: 'tyre' })).toEqual([]);
  });

  it('filters by open or finished status and by any of the chosen priorities', () => {
    expect(ids({ status: 'open' })).toEqual(['1', '3']);
    expect(ids({ status: 'finished' })).toEqual(['2']);
    expect(ids({ priorities: [3, 1] })).toEqual(['1', '2']);
    expect(ids({ status: 'open', priorities: [0], query: 'pump' })).toEqual(['3']);
    expect(activeWorkOrderFilterCount({ query: 'x', status: 'open', priorities: [1, 2] })).toBe(3);
  });
});

describe('WorkOrdersGate', () => {
  it('waits for flags, then sends a disabled module home', async () => {
    featureFlagsStore.setState({ flags: {}, isLoaded: false } as never);
    const { rerender } = await render(<WorkOrdersScreen />);
    expect(screen.getByTestId('work-orders-gate-loading')).toBeTruthy();
    await act(() => {
      enable(false);
    });
    await rerender(<WorkOrdersScreen />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/home');
    expect(store.fetchWorkOrders).not.toHaveBeenCalled();
  });
});

describe('WorkOrdersScreen', () => {
  it('loads on focus, lists orders, switches the filter and pages', async () => {
    useWorkOrdersStore.setState({ list: { assignedToMe: true, items: [summary('1', { Priority: 3 })], page: 0, hasMore: true, canWrite: true, loaded: true } });
    await render(<WorkOrdersScreen />);
    expect(store.fetchAccess).toHaveBeenCalled();
    expect(store.fetchWorkOrders).toHaveBeenCalledWith(undefined, { bypassCache: false });
    expect(screen.getByTestId('work-order-urgent-1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('work-orders-all'));
    expect(store.fetchWorkOrders).toHaveBeenLastCalledWith({ assignedToMe: false }, { bypassCache: false });
    await fireEvent.press(screen.getByTestId('work-orders-more'));
    expect(store.fetchMoreWorkOrders).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('work-order-1'));
    expect(router.push).toHaveBeenCalledWith('/work-orders/1');
    await fireEvent.press(screen.getByTestId('work-orders-report'));
    expect(router.push).toHaveBeenLastCalledWith('/work-orders/new');
  });

  it('searches and filters the loaded orders', async () => {
    useWorkOrdersStore.setState({
      list: {
        assignedToMe: true,
        items: [summary('1', { Title: 'Pump leak', Priority: 3 }), summary('2', { Title: 'Ladder rung', Status: WorkOrderStatus.Closed }), summary('3', { Title: 'Pump packing', Priority: 0 })],
        page: 0,
        hasMore: true,
        canWrite: true,
        loaded: true,
      },
    });
    await render(<WorkOrdersScreen />);
    await fireEvent.changeText(screen.getByTestId('work-orders-search'), 'pump');
    expect(screen.queryByTestId('work-order-2')).toBeNull();
    expect(screen.getByTestId('work-order-1')).toBeTruthy();
    expect(screen.getByTestId('work-orders-filter-summary')).toHaveTextContent('workOrders.showing:2,3');

    await fireEvent.press(screen.getByTestId('work-orders-filter-button'));
    await fireEvent.press(screen.getByTestId('work-orders-filter-sheet-priority-0', hidden));
    expect(screen.queryByTestId('work-order-1')).toBeNull();
    expect(screen.getByTestId('work-order-3')).toBeTruthy();
    expect(screen.getByTestId('work-orders-filter-count')).toHaveTextContent('1');

    await fireEvent.press(screen.getByTestId('work-orders-filter-sheet-status-finished', hidden));
    expect(screen.getByTestId('work-orders-no-matches')).toBeTruthy();
    expect(screen.getByTestId('work-orders-more')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('work-orders-filter-reset'));
    expect(screen.getByTestId('work-order-2')).toBeTruthy();
    expect(screen.getByTestId('work-orders-search')).toHaveProp('value', '');
    expect(screen.queryByTestId('work-orders-filter-count')).toBeNull();
  });

  it('is read-only without Readiness Pro and shows reports still waiting to send', async () => {
    useWorkOrdersStore.setState({
      access: { ChecklistsEnabled: true, MaintenanceEnabled: false, ProductName: 'Readiness Pro' },
      queuedReports: { q1: { localId: 'q1', input: { RequestId: 'q1', Revision: 0, Type: 0, Priority: 1, Content: { Title: 'Flat tyre', Steps: [] } }, createdAt: 1, state: 'queued' } },
    });
    await render(<WorkOrdersScreen />);
    expect(screen.getByTestId('work-orders-read-only')).toBeTruthy();
    expect(screen.queryByTestId('work-orders-report')).toBeNull();
    expect(screen.getByTestId('work-order-queued-q1')).toHaveTextContent(/workOrders\.reportWaiting/);
    expect(screen.getByTestId('work-orders-empty')).toBeTruthy();
  });
});

describe('WorkOrderReportScreen', () => {
  it('reports through the outbox and opens the created order', async () => {
    store.report.mockImplementationOnce(async () => {
      useWorkOrdersStore.setState({ ordersById: { 'wo-9': detail(summary('wo-9'), { Input: { RequestId: 'req-1' } as never }) } });
      return { outcome: 'sent', id: 'req-1' };
    });
    await render(<WorkOrderReportScreen />);
    expect(screen.getByTestId('work-order-submit')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('work-order-title'), ' Pump leak ');
    await fireEvent.press(screen.getByTestId('work-order-priority-2'));
    await fireEvent.press(screen.getByTestId('work-order-unit-7'));
    await fireEvent(screen.getByTestId('work-order-safety'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('work-order-submit'));
    await waitFor(() =>
      expect(store.report).toHaveBeenCalledWith({
        Revision: 0,
        Type: 0,
        Priority: 2,
        TargetUnitId: 7,
        TargetGroupId: null,
        InventoryAssetId: null,
        Content: { Title: 'Pump leak', Description: null, LocationText: null, Currency: 'USD', SafetyCritical: true, Steps: [] },
      })
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/work-orders/wo-9'));
    expect(toasts()).toContain('success:workOrders.reportSent');
  });

  it('offline: the report waits on the device and the form closes', async () => {
    store.report.mockResolvedValueOnce({ outcome: 'queued', id: 'req-2' });
    await render(<WorkOrderReportScreen />);
    await fireEvent.changeText(screen.getByTestId('work-order-title'), 'Door jammed');
    await fireEvent.press(screen.getByTestId('work-order-submit'));
    await waitFor(() => expect(toasts()).toContain('info:workOrders.reportQueued'));
    expect(router.back).toHaveBeenCalled();
  });

  it('cannot report when the department has no maintenance write access', async () => {
    useWorkOrdersStore.setState({ list: { assignedToMe: true, items: [], page: 0, hasMore: false, canWrite: false, loaded: true } });
    await render(<WorkOrderReportScreen />);
    await fireEvent.changeText(screen.getByTestId('work-order-title'), 'Door jammed');
    expect(screen.getByTestId('work-order-cannot-report')).toBeTruthy();
    expect(screen.getByTestId('work-order-submit')).toBeDisabled();
  });
});

describe('WorkOrderDetailScreen', () => {
  const open = async (overrides: Partial<WorkOrderDetail> = {}) => {
    useWorkOrdersStore.setState({ ordersById: { o1: detail(summary('o1'), overrides) } });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'o1' });
    return render(<WorkOrderDetailScreen />);
  };

  it('shows what the order is about and loads the current revision', async () => {
    await open();
    expect(store.fetchWorkOrder).toHaveBeenCalledWith('o1', { bypassCache: true });
    expect(screen.getByText('workOrders.unitIs:Engine 7')).toBeTruthy();
    expect(screen.getByText('workOrders.locationIs:Bay 2')).toBeTruthy();
    expect(screen.getByTestId('work-order-safety-flag')).toBeTruthy();
    expect(screen.getByText('workOrders.hoursLogged:1.5')).toBeTruthy();
    expect(screen.getByTestId('work-order-activity-a1')).toHaveTextContent(/workOrders\.status\.1/);
  });

  it('accepts at the current revision', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('work-order-accept'));
    await waitFor(() => expect(store.accept).toHaveBeenCalledWith('o1', 3));
  });

  it('asks for required transition fields, then sends them', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('work-order-transition-status-4'));
    await fireEvent.press(screen.getByTestId('work-order-move'));
    expect(screen.getByTestId('work-order-transition-missing')).toHaveTextContent('workOrders.transition.missing.reason');
    expect(store.transition).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('work-order-reason'), ' waiting for parts ');
    await fireEvent.press(screen.getByTestId('work-order-move'));
    await waitFor(() => expect(store.transition).toHaveBeenCalledWith('o1', expect.objectContaining({ Revision: 3, Status: 4, Reason: 'waiting for parts', ConfirmTasksComplete: false })));
  });

  it('a stale revision reloads the order and says someone else changed it', async () => {
    store.comment.mockImplementationOnce(async () => {
      useWorkOrdersStore.setState({ actionError: { code: 'conflict', status: 409, messageKey: 'errors.data.conflict' } });
      return false;
    });
    await open();
    await fireEvent.changeText(screen.getByTestId('work-order-comment'), 'Done');
    await fireEvent.press(screen.getByTestId('work-order-comment-save'));
    await waitFor(() => expect(screen.getByTestId('work-order-error')).toHaveTextContent('workOrders.errors.Conflict'));
    expect(store.fetchWorkOrder).toHaveBeenLastCalledWith('o1', { bypassCache: true });
    expect(store.fetchWorkOrder).toHaveBeenCalledTimes(2);
  });

  it('logs valid hours for today and refuses invalid ones', async () => {
    await open();
    await fireEvent.changeText(screen.getByTestId('work-order-hours'), '30');
    await fireEvent.press(screen.getByTestId('work-order-hours-save'));
    expect(screen.getByTestId('work-order-notice')).toHaveTextContent('workOrders.hoursInvalid');
    await fireEvent.changeText(screen.getByTestId('work-order-hours'), '2,25');
    await fireEvent.changeText(screen.getByTestId('work-order-hours-note'), 'Replaced seal');
    await fireEvent.press(screen.getByTestId('work-order-hours-save'));
    await waitFor(() =>
      expect(store.logHours).toHaveBeenCalledWith('o1', { Revision: 3, UserId: null, WorkDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), Content: { Hours: 2.25, Note: 'Replaced seal', Currency: 'USD' } })
    );
  });

  it('attaches a camera photo and loads an attached image on request', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('work-order-camera'));
    await waitFor(() => expect(store.attachFile).toHaveBeenCalledWith('o1', 3, { uri: 'file:///photo.jpg', name: 'work-order-WO-o1.jpg', type: 'image/jpeg' }));
    expect(screen.getByTestId('work-order-notice')).toHaveTextContent('workOrders.photoAdded');
    await fireEvent.press(screen.getByTestId('work-order-file-f1'));
    expect(store.fetchImage).toHaveBeenCalledWith('f1');
    await act(() => {
      useWorkOrdersStore.setState({ imagesById: { f1: 'data:image/jpeg;base64,AAA' } });
    });
    expect(screen.getByTestId('work-order-image-f1')).toBeTruthy();

    // Tapping the photo shows it full screen in the shared viewer.
    await fireEvent.press(screen.getByTestId('work-order-image-open-f1'));
    expect(screen.getByTestId('work-order-image-viewer-image', { includeHiddenElements: true }).props.source).toEqual({ uri: 'data:image/jpeg;base64,AAA' });
    await fireEvent.press(screen.getByTestId('work-order-image-viewer-close', { includeHiddenElements: true }));
    expect(screen.queryByTestId('work-order-image-viewer-image', { includeHiddenElements: true })).toBeNull();
  });

  it('says photo access is off when permission is refused', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false });
    await open();
    await fireEvent.press(screen.getByTestId('work-order-camera'));
    await waitFor(() => expect(screen.getByTestId('work-order-error')).toHaveTextContent('workOrders.errors.photo_denied'));
    expect(store.attachFile).not.toHaveBeenCalled();
  });

  it('hides every command when the person cannot write, and refuses unsafe ids', async () => {
    const { unmount } = await open({ CanWrite: false });
    expect(screen.queryByTestId('work-order-accept')).toBeNull();
    expect(screen.queryByTestId('work-order-transition')).toBeNull();
    expect(screen.queryByTestId('work-order-comment')).toBeNull();
    await unmount();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '../../settings' });
    await render(<WorkOrderDetailScreen />);
    expect(screen.getByTestId('work-order-invalid')).toBeTruthy();
  });
});
