import '../../status/__tests__/test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import { useWorkOrdersStore } from '@resgrid/data';
import { type WorkOrderDetail, WorkOrderStatus, type WorkOrderSummary } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React from 'react';

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

describe('WorkOrdersGate', () => {
  it('waits for flags, then sends a disabled module home', () => {
    featureFlagsStore.setState({ flags: {}, isLoaded: false } as never);
    const { rerender } = render(<WorkOrdersScreen />);
    expect(screen.getByTestId('work-orders-gate-loading')).toBeTruthy();
    act(() => enable(false));
    rerender(<WorkOrdersScreen />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/home');
    expect(store.fetchWorkOrders).not.toHaveBeenCalled();
  });
});

describe('WorkOrdersScreen', () => {
  it('loads on focus, lists orders, switches the filter and pages', () => {
    useWorkOrdersStore.setState({ list: { assignedToMe: true, items: [summary('1', { Priority: 3 })], page: 0, hasMore: true, canWrite: true, loaded: true } });
    render(<WorkOrdersScreen />);
    expect(store.fetchAccess).toHaveBeenCalled();
    expect(store.fetchWorkOrders).toHaveBeenCalledWith(undefined, { bypassCache: false });
    expect(screen.getByTestId('work-order-urgent-1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('work-orders-all'));
    expect(store.fetchWorkOrders).toHaveBeenLastCalledWith({ assignedToMe: false }, { bypassCache: false });
    fireEvent.press(screen.getByTestId('work-orders-more'));
    expect(store.fetchMoreWorkOrders).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('work-order-1'));
    expect(router.push).toHaveBeenCalledWith('/work-orders/1');
    fireEvent.press(screen.getByTestId('work-orders-report'));
    expect(router.push).toHaveBeenLastCalledWith('/work-orders/new');
  });

  it('is read-only without Readiness Pro and shows reports still waiting to send', () => {
    useWorkOrdersStore.setState({
      access: { ChecklistsEnabled: true, MaintenanceEnabled: false, ProductName: 'Readiness Pro' },
      queuedReports: { q1: { localId: 'q1', input: { RequestId: 'q1', Revision: 0, Type: 0, Priority: 1, Content: { Title: 'Flat tyre', Steps: [] } }, createdAt: 1, state: 'queued' } },
    });
    render(<WorkOrdersScreen />);
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
    render(<WorkOrderReportScreen />);
    expect(screen.getByTestId('work-order-submit')).toBeDisabled();
    fireEvent.changeText(screen.getByTestId('work-order-title'), ' Pump leak ');
    fireEvent.press(screen.getByTestId('work-order-priority-2'));
    fireEvent.press(screen.getByTestId('work-order-unit-7'));
    fireEvent(screen.getByTestId('work-order-safety'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('work-order-submit'));
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
    render(<WorkOrderReportScreen />);
    fireEvent.changeText(screen.getByTestId('work-order-title'), 'Door jammed');
    fireEvent.press(screen.getByTestId('work-order-submit'));
    await waitFor(() => expect(toasts()).toContain('info:workOrders.reportQueued'));
    expect(router.back).toHaveBeenCalled();
  });

  it('cannot report when the department has no maintenance write access', () => {
    useWorkOrdersStore.setState({ list: { assignedToMe: true, items: [], page: 0, hasMore: false, canWrite: false, loaded: true } });
    render(<WorkOrderReportScreen />);
    fireEvent.changeText(screen.getByTestId('work-order-title'), 'Door jammed');
    expect(screen.getByTestId('work-order-cannot-report')).toBeTruthy();
    expect(screen.getByTestId('work-order-submit')).toBeDisabled();
  });
});

describe('WorkOrderDetailScreen', () => {
  const open = (overrides: Partial<WorkOrderDetail> = {}) => {
    useWorkOrdersStore.setState({ ordersById: { o1: detail(summary('o1'), overrides) } });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'o1' });
    return render(<WorkOrderDetailScreen />);
  };

  it('shows what the order is about and loads the current revision', () => {
    open();
    expect(store.fetchWorkOrder).toHaveBeenCalledWith('o1', { bypassCache: true });
    expect(screen.getByText('workOrders.unitIs:Engine 7')).toBeTruthy();
    expect(screen.getByText('workOrders.locationIs:Bay 2')).toBeTruthy();
    expect(screen.getByTestId('work-order-safety-flag')).toBeTruthy();
    expect(screen.getByText('workOrders.hoursLogged:1.5')).toBeTruthy();
    expect(screen.getByTestId('work-order-activity-a1')).toHaveTextContent(/workOrders\.status\.1/);
  });

  it('accepts at the current revision', async () => {
    open();
    fireEvent.press(screen.getByTestId('work-order-accept'));
    await waitFor(() => expect(store.accept).toHaveBeenCalledWith('o1', 3));
  });

  it('asks for required transition fields, then sends them', async () => {
    open();
    fireEvent.press(screen.getByTestId('work-order-transition-status-4'));
    fireEvent.press(screen.getByTestId('work-order-move'));
    expect(screen.getByTestId('work-order-transition-missing')).toHaveTextContent('workOrders.transition.missing.reason');
    expect(store.transition).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('work-order-reason'), ' waiting for parts ');
    fireEvent.press(screen.getByTestId('work-order-move'));
    await waitFor(() => expect(store.transition).toHaveBeenCalledWith('o1', expect.objectContaining({ Revision: 3, Status: 4, Reason: 'waiting for parts', ConfirmTasksComplete: false })));
  });

  it('a stale revision reloads the order and says someone else changed it', async () => {
    store.comment.mockImplementationOnce(async () => {
      useWorkOrdersStore.setState({ actionError: { code: 'conflict', status: 409, messageKey: 'errors.data.conflict' } });
      return false;
    });
    open();
    fireEvent.changeText(screen.getByTestId('work-order-comment'), 'Done');
    fireEvent.press(screen.getByTestId('work-order-comment-save'));
    await waitFor(() => expect(screen.getByTestId('work-order-error')).toHaveTextContent('workOrders.errors.Conflict'));
    expect(store.fetchWorkOrder).toHaveBeenLastCalledWith('o1', { bypassCache: true });
    expect(store.fetchWorkOrder).toHaveBeenCalledTimes(2);
  });

  it('logs valid hours for today and refuses invalid ones', async () => {
    open();
    fireEvent.changeText(screen.getByTestId('work-order-hours'), '30');
    fireEvent.press(screen.getByTestId('work-order-hours-save'));
    expect(screen.getByTestId('work-order-notice')).toHaveTextContent('workOrders.hoursInvalid');
    fireEvent.changeText(screen.getByTestId('work-order-hours'), '2,25');
    fireEvent.changeText(screen.getByTestId('work-order-hours-note'), 'Replaced seal');
    fireEvent.press(screen.getByTestId('work-order-hours-save'));
    await waitFor(() =>
      expect(store.logHours).toHaveBeenCalledWith('o1', { Revision: 3, UserId: null, WorkDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), Content: { Hours: 2.25, Note: 'Replaced seal', Currency: 'USD' } })
    );
  });

  it('attaches a camera photo and loads an attached image on request', async () => {
    open();
    fireEvent.press(screen.getByTestId('work-order-camera'));
    await waitFor(() => expect(store.attachFile).toHaveBeenCalledWith('o1', 3, { uri: 'file:///photo.jpg', name: 'work-order-WO-o1.jpg', type: 'image/jpeg' }));
    expect(screen.getByTestId('work-order-notice')).toHaveTextContent('workOrders.photoAdded');
    fireEvent.press(screen.getByTestId('work-order-file-f1'));
    expect(store.fetchImage).toHaveBeenCalledWith('f1');
    act(() => useWorkOrdersStore.setState({ imagesById: { f1: 'data:image/jpeg;base64,AAA' } }));
    expect(screen.getByTestId('work-order-image-f1')).toBeTruthy();
  });

  it('says photo access is off when permission is refused', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false });
    open();
    fireEvent.press(screen.getByTestId('work-order-camera'));
    await waitFor(() => expect(screen.getByTestId('work-order-error')).toHaveTextContent('workOrders.errors.photo_denied'));
    expect(store.attachFile).not.toHaveBeenCalled();
  });

  it('hides every command when the person cannot write, and refuses unsafe ids', () => {
    const { unmount } = open({ CanWrite: false });
    expect(screen.queryByTestId('work-order-accept')).toBeNull();
    expect(screen.queryByTestId('work-order-transition')).toBeNull();
    expect(screen.queryByTestId('work-order-comment')).toBeNull();
    unmount();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '../../settings' });
    render(<WorkOrderDetailScreen />);
    expect(screen.getByTestId('work-order-invalid')).toBeTruthy();
  });
});
