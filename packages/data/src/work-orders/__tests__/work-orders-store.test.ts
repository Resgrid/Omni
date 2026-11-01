import * as api from '@resgrid/api';
import type { WorkOrderDetail, WorkOrderSummary } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, httpError, ok } from '../../__tests__/helpers';
import { useWorkOrdersStore } from '../work-orders-store';

jest.mock('@resgrid/api', () => {
  const actual = jest.requireActual('@resgrid/api');
  return { ...actual, getWorkOrders: jest.fn(), uploadWorkOrderFile: jest.fn(), getWorkOrderImage: jest.fn(), setWorkOrderStatus: jest.fn() };
});

const summary = (Id: string, overrides: Partial<WorkOrderSummary> = {}): WorkOrderSummary =>
  ({ Id, Number: `WO-${Id}`, Title: `Order ${Id}`, Status: 0, Priority: 1, Revision: 1, UpdatedOn: '', CreatedOn: '', ...overrides }) as WorkOrderSummary;

const detail = (order: WorkOrderSummary): WorkOrderDetail =>
  ({ Order: order, Input: { Content: { Title: order.Title, Steps: [] } }, CanWrite: true, Transitions: [], Activities: [], Labor: [], Files: [] }) as unknown as WorkOrderDetail;

beforeEach(async () => {
  await createDataTestRuntime({ variant: 'responder' });
  await defaultResetRegistry.getStoreResets().get('data.work-orders')?.('logout');
});

describe('work orders store: list', () => {
  it('loads the first page for a filter and pages without duplicates', async () => {
    jest.mocked(api.getWorkOrders).mockResolvedValueOnce(ok({ Items: [summary('1'), summary('2')], HasMore: true, CanWrite: true }) as never);
    await useWorkOrdersStore.getState().fetchWorkOrders({ assignedToMe: false });
    expect(api.getWorkOrders).toHaveBeenLastCalledWith(expect.anything(), { Page: 0, AssignedToMe: false });
    expect(useWorkOrdersStore.getState().list).toMatchObject({ assignedToMe: false, page: 0, hasMore: true, canWrite: true });

    jest.mocked(api.getWorkOrders).mockResolvedValueOnce(ok({ Items: [summary('2'), summary('3')], HasMore: false, CanWrite: true }) as never);
    await useWorkOrdersStore.getState().fetchMoreWorkOrders();
    expect(api.getWorkOrders).toHaveBeenLastCalledWith(expect.anything(), { Page: 1, AssignedToMe: false });
    expect(useWorkOrdersStore.getState().list.items.map((item) => item.Id)).toEqual(['1', '2', '3']);
    expect(useWorkOrdersStore.getState().list.hasMore).toBe(false);

    await useWorkOrdersStore.getState().fetchMoreWorkOrders();
    expect(api.getWorkOrders).toHaveBeenCalledTimes(2);
  });

  it('defaults to the last filter and keeps the list row in step with a command answer', async () => {
    jest.mocked(api.getWorkOrders).mockResolvedValue(ok({ Items: [summary('1')], HasMore: false, CanWrite: false }) as never);
    await useWorkOrdersStore.getState().fetchWorkOrders();
    expect(api.getWorkOrders).toHaveBeenLastCalledWith(expect.anything(), { Page: 0, AssignedToMe: true });

    jest.mocked(api.setWorkOrderStatus).mockResolvedValue(ok(detail(summary('1', { Status: 3, Revision: 2 }))) as never);
    expect(await useWorkOrdersStore.getState().transition('1', { Revision: 1, Status: 3 })).toBe(true);
    expect(useWorkOrdersStore.getState().list.items[0]).toMatchObject({ Status: 3, Revision: 2 });
    expect(useWorkOrdersStore.getState().ordersById['1'].Order.Status).toBe(3);
  });
});

describe('work orders store: files', () => {
  it('uploads a file as multipart with the current revision and adopts the detail', async () => {
    jest.mocked(api.uploadWorkOrderFile).mockResolvedValue(ok(detail(summary('1', { Revision: 5 }))) as never);
    const ok1 = await useWorkOrdersStore.getState().attachFile('1', 4, { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' });
    expect(ok1).toBe(true);
    const [, form, options] = jest.mocked(api.uploadWorkOrderFile).mock.calls[0];
    expect(form).toBeInstanceOf(FormData);
    expect(options).toEqual({ timeoutMs: 60_000 });
    expect(useWorkOrdersStore.getState().ordersById['1'].Order.Revision).toBe(5);
  });

  it('records a refused upload (stale revision) as the action error', async () => {
    jest.mocked(api.uploadWorkOrderFile).mockRejectedValue(httpError(409));
    expect(await useWorkOrdersStore.getState().attachFile('1', 1, { uri: 'u', name: 'n', type: 'image/jpeg' })).toBe(false);
    expect(useWorkOrdersStore.getState().actionError?.code).toBe('conflict');
  });

  it('caches images in memory and answers null when one cannot be shown', async () => {
    jest.mocked(api.getWorkOrderImage).mockResolvedValueOnce('data:image/png;base64,AAA');
    expect(await useWorkOrdersStore.getState().fetchImage('f1')).toBe('data:image/png;base64,AAA');
    expect(await useWorkOrdersStore.getState().fetchImage('f1')).toBe('data:image/png;base64,AAA');
    expect(api.getWorkOrderImage).toHaveBeenCalledTimes(1);

    jest.mocked(api.getWorkOrderImage).mockRejectedValueOnce(new Error('Unsupported image'));
    expect(await useWorkOrdersStore.getState().fetchImage('f2')).toBeNull();
  });

  it('forgets the list and images on sign-out', async () => {
    jest.mocked(api.getWorkOrders).mockResolvedValue(ok({ Items: [summary('1')], HasMore: false, CanWrite: true }) as never);
    jest.mocked(api.getWorkOrderImage).mockResolvedValue('data:image/png;base64,AAA');
    await useWorkOrdersStore.getState().fetchWorkOrders();
    await useWorkOrdersStore.getState().fetchImage('f1');
    await defaultResetRegistry.getStoreResets().get('data.work-orders')?.('logout');
    expect(useWorkOrdersStore.getState().list.items).toEqual([]);
    expect(useWorkOrdersStore.getState().imagesById).toEqual({});
  });
});
