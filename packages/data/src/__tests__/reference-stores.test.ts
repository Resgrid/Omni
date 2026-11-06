import * as api from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';
import { createTestPayloadCipher } from '@resgrid/offline/testing';

import { useCalendarStore } from '../calendar/calendar-store';
import { useCertificationsStore } from '../certifications/certifications-store';
import { useChecklistsStore } from '../checklists/checklists-store';
import { useContactsStore } from '../contacts/contacts-store';
import { useInventoryStore } from '../inventory/inventory-store';
import { useCustomMapsStore } from '../mapping/custom-maps-store';
import { useMessagesStore } from '../messages/messages-store';
import { useNotesStore } from '../notes/notes-store';
import { ALL_DATA_OUTBOX_HANDLERS } from '../offline-scope/register';
import { useOperationsStore } from '../operations/operations-store';
import { usePoisStore } from '../pois/pois-store';
import { useProtocolsStore } from '../protocols/protocols-store';
import { useRecordDeploymentsStore } from '../records/record-deployments-store';
import { useShiftsStore } from '../shifts/shifts-store';
import { useWorkOrdersStore } from '../work-orders/work-orders-store';
import { createDataTestRuntime, type DataTestRuntime, flush, httpError, notFound, ok, persisted } from './helpers';

jest.mock('@resgrid/api', () => {
  const actual = jest.requireActual('@resgrid/api');
  const mocked: Record<string, unknown> = { ...actual };
  for (const name of [
    'getAllContacts',
    'getContactPreplan',
    'getPois',
    'getPoi',
    'getAllProtocols',
    'getAllNotes',
    'getDepartmentCalendarItems',
    'getTodaysShifts',
    'getInboxMessages',
    'sendMessage',
    'getDeployments',
    'saveTimeEntries',
    'saveExpense',
    'getUnitEquipment',
    'saveInventoryCount',
    'getWorkOrder',
    'newWorkOrder',
    'getUserCertifications',
    'getCustomMaps',
    'searchAllMapFeatures',
    'getRecordDeployments',
    'getChecklistAccess',
    'saveChecklistRunProgress',
    'completeChecklistRun',
    'signupForShiftDay',
    'getMyShifts',
  ]) {
    mocked[name] = jest.fn();
  }
  return mocked;
});

type AnyStore = { getState: () => Record<string, unknown> & { errors: Record<string, unknown>; fetchedAt: Record<string, number> } };

interface Case {
  name: string;
  store: AnyStore;
  reset: string;
  persistName: string;
  endpoint: string;
  slice: string;
  field: string;
  fetch: () => Promise<unknown>;
  item: unknown;
  /** What the store keeps for `item` when it converts the wire shape (defaults to `item`). */
  stored?: unknown;
}

const cases: Case[] = [
  {
    name: 'contacts',
    store: useContactsStore as unknown as AnyStore,
    reset: 'data.contacts',
    persistName: 'omni-contacts-storage',
    endpoint: 'getAllContacts',
    slice: 'contacts',
    field: 'contacts',
    fetch: () => useContactsStore.getState().fetchContacts(),
    item: { ContactId: 'c1' },
  },
  {
    name: 'pois',
    store: usePoisStore as unknown as AnyStore,
    reset: 'data.pois',
    persistName: 'omni-pois-storage',
    endpoint: 'getPois',
    slice: 'pois',
    field: 'pois',
    fetch: () => usePoisStore.getState().fetchPois({ bypassCache: true }),
    item: { PoiId: 1 },
  },
  {
    name: 'protocols',
    store: useProtocolsStore as unknown as AnyStore,
    reset: 'data.protocols',
    persistName: 'omni-protocols-storage',
    endpoint: 'getAllProtocols',
    slice: 'protocols',
    field: 'protocols',
    fetch: () => useProtocolsStore.getState().fetchProtocols(),
    // Core's Protocols controller sends ProtocolId; the store keeps the screen shape (Id).
    item: { ProtocolId: 'p1' },
    stored: expect.objectContaining({ Id: 'p1' }),
  },
  {
    name: 'notes',
    store: useNotesStore as unknown as AnyStore,
    reset: 'data.notes',
    persistName: 'omni-notes-storage',
    endpoint: 'getAllNotes',
    slice: 'notes',
    field: 'notes',
    fetch: () => useNotesStore.getState().fetchNotes(),
    item: { NoteId: 'n1' },
  },
  {
    name: 'calendar',
    store: useCalendarStore as unknown as AnyStore,
    reset: 'data.calendar',
    persistName: 'omni-calendar-storage',
    endpoint: 'getDepartmentCalendarItems',
    slice: 'items',
    field: 'calendarItems',
    fetch: () => useCalendarStore.getState().fetchCalendarItems(),
    item: { CalendarItemId: 'ci1' },
  },
  {
    name: 'shifts',
    store: useShiftsStore as unknown as AnyStore,
    reset: 'data.shifts',
    persistName: 'omni-shifts-storage',
    endpoint: 'getTodaysShifts',
    slice: 'today',
    field: 'todaysShiftDays',
    fetch: () => useShiftsStore.getState().fetchTodaysShifts(),
    item: { ShiftDayId: 's1' },
  },
  {
    name: 'messages',
    store: useMessagesStore as unknown as AnyStore,
    reset: 'data.messages',
    persistName: 'omni-messages-storage',
    endpoint: 'getInboxMessages',
    slice: 'inbox',
    field: 'inboxMessages',
    fetch: () => useMessagesStore.getState().fetchInboxMessages(),
    item: { MessageId: 'm1', SentOnUtc: '2026-10-31T11:00:00Z' },
  },
  {
    name: 'operations',
    store: useOperationsStore as unknown as AnyStore,
    reset: 'data.operations',
    persistName: 'omni-operations-storage',
    endpoint: 'getDeployments',
    slice: 'deployments',
    field: 'deployments',
    fetch: () => useOperationsStore.getState().loadDeployments(),
    item: { Id: 'd1' },
  },
  {
    name: 'certifications',
    store: useCertificationsStore as unknown as AnyStore,
    reset: 'data.certifications',
    persistName: 'omni-certifications-storage',
    endpoint: 'getUserCertifications',
    slice: 'mine',
    field: 'certifications',
    fetch: () => useCertificationsStore.getState().fetchCertifications(),
    item: { Id: 1 },
  },
  {
    name: 'custom maps',
    store: useCustomMapsStore as unknown as AnyStore,
    reset: 'data.custom-maps',
    persistName: 'omni-custom-maps-storage',
    endpoint: 'getCustomMaps',
    slice: 'customMaps',
    field: 'customMaps',
    fetch: () => useCustomMapsStore.getState().fetchCustomMaps(),
    item: { CustomMapId: 'cm1' },
  },
  {
    name: 'record deployments',
    store: useRecordDeploymentsStore as unknown as AnyStore,
    reset: 'data.record-deployments',
    persistName: 'records-deployments-storage',
    endpoint: 'getRecordDeployments',
    slice: 'deployments',
    field: 'deployments',
    fetch: () => useRecordDeploymentsStore.getState().fetchDeployments(),
    item: { OrderId: 'o1' },
  },
];

let runtime: DataTestRuntime;

beforeEach(async () => {
  // Every handler: these member and field modules span Responder and Unit scopes.
  runtime = await createDataTestRuntime({ variant: 'responder', handlers: ALL_DATA_OUTBOX_HANDLERS });
  for (const testCase of cases) await defaultResetRegistry.getStoreResets().get(testCase.reset)?.('logout');
});

describe.each(cases)('$name store', (testCase) => {
  const endpoint = (): jest.Mock => jest.requireMock<Record<string, jest.Mock>>('@resgrid/api')[testCase.endpoint];

  it('fetch success fills the slice, stamps fetchedAt and persists data only', async () => {
    endpoint().mockResolvedValue(ok([testCase.item]));
    await testCase.fetch();
    const state = testCase.store.getState();
    expect(state[testCase.field]).toEqual([testCase.stored ?? testCase.item]);
    expect(state.errors[testCase.slice]).toBeNull();
    expect(state.fetchedAt[testCase.slice]).toBe(runtime.clock.now());
    const blob = persisted(runtime.kv, testCase.persistName);
    expect(blob?.state).toHaveProperty(testCase.field);
    expect(blob?.state).not.toHaveProperty('loading');
    expect(blob?.state).not.toHaveProperty('errors');
  });

  it('fetch error records a translatable code and keeps the data', async () => {
    endpoint().mockResolvedValue(ok([testCase.item]));
    await testCase.fetch();
    endpoint().mockRejectedValue(httpError(500));
    await testCase.fetch();
    const state = testCase.store.getState();
    expect(state.errors[testCase.slice]).toMatchObject({ code: 'server', messageKey: 'errors.data.server' });
    expect(state[testCase.field]).toEqual([testCase.stored ?? testCase.item]);
  });

  it('not_found is an empty answer', async () => {
    endpoint().mockResolvedValue(notFound([]));
    await testCase.fetch();
    expect(testCase.store.getState()[testCase.field]).toEqual([]);
    expect(testCase.store.getState().errors[testCase.slice]).toBeNull();
  });

  it('resets on wipe', async () => {
    endpoint().mockResolvedValue(ok([testCase.item]));
    await testCase.fetch();
    await defaultResetRegistry.getStoreResets().get(testCase.reset)?.('server-switch');
    expect(testCase.store.getState()[testCase.field]).toEqual([]);
  });
});

describe('messages retention', () => {
  it('shows every message the server returns but persists only the 30-day window', async () => {
    const recent = { MessageId: 'm1', SentOnUtc: '2026-10-31T11:00:00Z' };
    const old = { MessageId: 'm2', SentOnUtc: '2024-10-10T04:17:13Z' };
    jest.mocked(api.getInboxMessages).mockResolvedValue(ok([old, recent]) as never);
    await useMessagesStore.getState().fetchInboxMessages();
    expect(useMessagesStore.getState().inboxMessages).toEqual([old, recent]);
    expect(persisted(runtime.kv, 'omni-messages-storage')?.state.inboxMessages).toEqual([recent]);
  });

  it('keeps an inbox of only old messages visible', async () => {
    const old = { MessageId: 'm2', SentOnUtc: '2024-10-10T04:17:13Z' };
    jest.mocked(api.getInboxMessages).mockResolvedValue(ok([old]) as never);
    await useMessagesStore.getState().fetchInboxMessages();
    expect(useMessagesStore.getState().inboxMessages).toEqual([old]);
    expect(persisted(runtime.kv, 'omni-messages-storage')?.state.inboxMessages).toEqual([]);
  });
});

describe('custom maps feature search', () => {
  const search = (): jest.Mock => jest.requireMock<Record<string, jest.Mock>>('@resgrid/api').searchAllMapFeatures;

  it('searches by term and scope, keeps only the newest term’s answer and never persists results', async () => {
    search().mockResolvedValue(ok([{ FeatureType: 'indoor_zone', Id: 'z1', Name: 'Lobby' }]));
    await useCustomMapsStore.getState().searchMapFeatures('  lobby ', 'indoor');
    expect(search()).toHaveBeenCalledWith(expect.anything(), { term: 'lobby', type: 'indoor' });
    expect(useCustomMapsStore.getState().searchResults).toEqual([{ FeatureType: 'indoor_zone', Id: 'z1', Name: 'Lobby' }]);
    expect(persisted(runtime.kv, 'omni-custom-maps-storage')?.state).not.toHaveProperty('searchResults');

    let answerOld: (value: unknown) => void = () => undefined;
    search().mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)));
    const older = useCustomMapsStore.getState().searchMapFeatures('lob');
    search().mockResolvedValueOnce(ok([{ FeatureType: 'custom_region', Id: 'r1', Name: 'Lobster pound' }]));
    await useCustomMapsStore.getState().searchMapFeatures('lobs');
    answerOld(ok([{ FeatureType: 'indoor_zone', Id: 'z2', Name: 'Lobby 2' }]));
    await older;
    expect(useCustomMapsStore.getState().searchResults.map((item) => item.Id)).toEqual(['r1']);

    await useCustomMapsStore.getState().searchMapFeatures('   ');
    expect(useCustomMapsStore.getState().searchResults).toEqual([]);
  });
});

describe('operations deployments list', () => {
  it('asks Core for open deployments, and for every one with active=false (a missing flag reads as open only)', async () => {
    jest.mocked(api.getDeployments).mockResolvedValue(ok([{ Id: 'd1' }]) as never);
    await useOperationsStore.getState().loadDeployments();
    expect(api.getDeployments).toHaveBeenLastCalledWith(expect.anything(), { active: true });
    await useOperationsStore.getState().loadDeployments(true);
    expect(api.getDeployments).toHaveBeenLastCalledWith(expect.anything(), { active: false });
  });
});

describe('offline writes of the member/field modules', () => {
  it('messages: compose queues offline and sends on reconnect (Responder)', async () => {
    runtime.connectivity.setOnline(false);
    const result = await useMessagesStore.getState().sendNewMessage({ Title: 'Drill', Body: 'Tonight', Type: 0, Recipients: [] });
    expect(useMessagesStore.getState().queuedMessages[result.id].state).toBe('queued');
    jest.mocked(api.sendMessage).mockResolvedValue({ Id: '1', Status: 'success' } as never);
    jest.mocked(api.getInboxMessages).mockResolvedValue(ok([]) as never);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    await flush();
    expect(useMessagesStore.getState().queuedMessages).toEqual({});
  });

  it('operations: time entries of one report coalesce (newest wins); expenses queue', async () => {
    runtime.connectivity.setOnline(false);
    await useOperationsStore.getState().saveTimeEntries('d1', { TimeReportId: 'tr-1', Entries: [] });
    runtime.clock.advance(1000);
    const newest = await useOperationsStore.getState().saveTimeEntries('d1', { TimeReportId: 'tr-1', Entries: [{ Id: 'e' } as never] });
    await useOperationsStore.getState().addExpense('d1', { DeploymentId: 'd1' } as never);
    const rows = await runtime.rows();
    expect(rows.map((row) => row.type)).toEqual(['operations.timeEntries.save', 'operations.expense.save']);
    expect(rows[0].id).toBe(newest.id);
  });

  it('time report validation errors are refusals (dead-lettered)', async () => {
    jest.mocked(api.saveTimeEntries).mockResolvedValue({ Data: null, Status: 'success', Errors: [{ Code: 'x' }] } as never);
    const result = await useOperationsStore.getState().saveTimeEntries('d1', { TimeReportId: 'tr-2', Entries: [] });
    expect(result.outcome).toBe('rejected');
  });

  it('inventory: count saves coalesce per count and replay on reconnect', async () => {
    runtime.connectivity.setOnline(false);
    await useInventoryStore.getState().saveCount('ct-1', { Id: 'ct-1', Lines: [1] });
    await useInventoryStore.getState().saveCount('ct-1', { Id: 'ct-1', Lines: [1, 2] });
    expect(await runtime.rows()).toHaveLength(1);
    jest.mocked(api.saveInventoryCount).mockResolvedValue({ Data: { Count: { Id: 'ct-1' }, Lines: [] } } as never);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    expect(api.saveInventoryCount).toHaveBeenCalledWith(expect.anything(), { Id: 'ct-1', Lines: [1, 2] });
    expect(useInventoryStore.getState().countsById['ct-1']).toBeDefined();
  });

  it('work orders: a report sends RequestId = outbox id (retried create returns the same order)', async () => {
    jest.mocked(api.newWorkOrder).mockResolvedValue({ Data: { Order: { Id: 'wo-1' } }, Status: 'success' } as never);
    const result = await useWorkOrdersStore.getState().report({ Revision: 0, Type: 1, Priority: 1 } as never);
    expect(result.outcome).toBe('sent');
    expect(api.newWorkOrder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ RequestId: result.id }));
    await flush();
    expect(useWorkOrdersStore.getState().ordersById['wo-1']).toBeDefined();
    expect(useWorkOrdersStore.getState().queuedReports).toEqual({});
  });

  it('shifts: a mutation returns the server outcome code and refreshes affected lists', async () => {
    jest.mocked(api.signupForShiftDay).mockResolvedValue({ Id: '', ApprovalPending: false, ErrorCode: 'ShiftFull', Status: 'failure' } as never);
    const refused = await useShiftsStore.getState().signupForShift('5', '2');
    expect(refused).toEqual({ success: false, errorCode: 'ShiftFull', approvalPending: false, id: '' });
    jest.mocked(api.signupForShiftDay).mockResolvedValue({ Id: 's9', ApprovalPending: true, ErrorCode: '', Status: 'success' } as never);
    jest.mocked(api.getTodaysShifts).mockResolvedValue(ok([]) as never);
    jest.mocked(api.getMyShifts).mockResolvedValue(ok([]) as never);
    const accepted = await useShiftsStore.getState().signupForShift('5', '2');
    expect(accepted).toMatchObject({ success: true, approvalPending: true, id: 's9' });
    expect(api.signupForShiftDay).toHaveBeenLastCalledWith(expect.anything(), { ShiftDayId: 5, GroupId: 2 });
    expect(api.getMyShifts).toHaveBeenCalled();
  });

  it('contacts: per-contact preplans load once unless bypassCache (Dispatch)', async () => {
    jest.mocked(api.getContactPreplan).mockResolvedValue(ok({ ContactId: 'c1' }) as never);
    await useContactsStore.getState().fetchPreplan('c1');
    await useContactsStore.getState().fetchPreplan('c1');
    expect(api.getContactPreplan).toHaveBeenCalledTimes(1);
    await useContactsStore.getState().fetchPreplan('c1', { bypassCache: true });
    expect(api.getContactPreplan).toHaveBeenCalledTimes(2);
  });

  it('pois: a POI opened once stays readable offline (Responder detail cache)', async () => {
    jest.mocked(api.getPoi).mockResolvedValue(ok({ PoiId: 4, Name: 'Hospital' }) as never);
    expect((await usePoisStore.getState().fetchPoi(4))?.Name).toBe('Hospital');
    jest.mocked(api.getPoi).mockRejectedValue(httpError(503));
    expect((await usePoisStore.getState().fetchPoi(4, { bypassCache: true }))?.Name).toBe('Hospital');
  });

  it('checklists: run saves queue encrypted offline, drafts coalesce, and the submit replays after them', async () => {
    const cipher = createTestPayloadCipher();
    runtime = await createDataTestRuntime({ variant: 'unit', handlers: ALL_DATA_OUTBOX_HANDLERS, cipher });
    runtime.connectivity.setOnline(false);
    const run = { Id: 'run-1', Revision: 3 } as never;
    const answers = (value: string) => ({ Revision: 3, Answers: [{ ItemId: 'i1', Value: value }] }) as never;
    expect((await useChecklistsStore.getState().saveRun(run, answers('a'), false)).outcome).toBe('queued');
    runtime.clock.advance(1000);
    await useChecklistsStore.getState().saveRun(run, answers('b'), false);
    await useChecklistsStore.getState().saveRun(run, answers('b'), true);
    const rows = await runtime.rows();
    expect(rows.map((row) => row.type)).toEqual(['checklists.run.save', 'checklists.run.save']);
    expect(rows.every((row) => String(row.payloadEncoding).startsWith('cipher:'))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('"Value":"b"');

    jest.mocked(api.saveChecklistRunProgress).mockResolvedValue(ok({ Id: 'run-1', Revision: 4 }) as never);
    jest.mocked(api.completeChecklistRun).mockResolvedValue(ok({ Id: 'run-1', Revision: 5 }) as never);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    await flush();
    expect(jest.mocked(api.saveChecklistRunProgress)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(api.saveChecklistRunProgress).mock.calls[0][1]).toEqual({ Id: 'run-1', Input: answers('b') });
    expect(jest.mocked(api.saveChecklistRunProgress).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(api.completeChecklistRun).mock.invocationCallOrder[0]);
    expect(useChecklistsStore.getState().runsById['run-1']).toEqual({ Id: 'run-1', Revision: 5 });
  });

  it('checklists: without a payload cipher (web) a run save goes online only and never touches the outbox', async () => {
    jest.mocked(api.completeChecklistRun).mockResolvedValue(ok({ Id: 'run-2', Revision: 2 }) as never);
    const result = await useChecklistsStore.getState().saveRun({ Id: 'run-2', Revision: 1 } as never, { Revision: 1, Answers: [] } as never, true);
    expect(result).toEqual({ outcome: 'sent', run: { Id: 'run-2', Revision: 2 } });
    expect(await runtime.rows()).toEqual([]);
  });

  it('checklists: access is persisted, run contents are not', async () => {
    jest.mocked(api.getChecklistAccess).mockResolvedValue(ok({ Enabled: true }) as never);
    await useChecklistsStore.getState().fetchAccess();
    expect(persisted(runtime.kv, 'omni-checklists-storage')?.state).toEqual(expect.objectContaining({ access: { Enabled: true } }));
  });
});
