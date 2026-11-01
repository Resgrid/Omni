import { closeCallWith, closeCommand, establishCommand, getAdHocPersonnel, getAdHocUnits, getCommandBoard, getResourceIncidentView, getSyncBundle, saveObjective } from '@resgrid/api';
import type { IncidentCommandBoard } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, httpError, notFound, ok, persisted } from '../../__tests__/helpers';
import { setDataStorage } from '../../core/persist';
import { IC_EVENT, incidentOrderKey, useCommandStore, withPendingLocalRows } from '../command-store';
import { useResourceViewStore } from '../resource-view-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  establishCommand: jest.fn(),
  closeCommand: jest.fn(),
  closeCallWith: jest.fn(),
  getCommandBoard: jest.fn(),
  getAdHocUnits: jest.fn(),
  getAdHocPersonnel: jest.fn(),
  getSyncBundle: jest.fn(),
  saveObjective: jest.fn(),
  getResourceIncidentView: jest.fn(),
}));

const board = (callId: number, extra: Partial<IncidentCommandBoard> = {}): IncidentCommandBoard =>
  ({
    Command: { IncidentCommandId: `ic-${callId}`, CallId: callId },
    Nodes: [],
    Assignments: [],
    Objectives: [],
    Needs: [],
    Timers: [],
    Annotations: [],
    Accountability: [],
    Roles: [],
    ...extra,
  }) as unknown as IncidentCommandBoard;

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'ic' });
  jest.mocked(getAdHocUnits).mockResolvedValue(ok([]) as never);
  jest.mocked(getAdHocPersonnel).mockResolvedValue(ok([]) as never);
  for (const name of ['data.incident-command', 'data.resource-view']) await defaultResetRegistry.getStoreResets().get(name)?.('logout');
});

describe('incident command board (IC stores/command/*)', () => {
  it('establishes offline with a provisional board; the replay marks it established and refreshes', async () => {
    runtime.connectivity.setOnline(false);
    const result = await useCommandStore.getState().startCommand('7', 3);
    expect(result?.outcome).toBe('queued');
    expect(useCommandStore.getState().boards['7'].isProvisional).toBe(true);
    expect(useCommandStore.getState().activeCallId).toBe('7');

    jest.mocked(establishCommand).mockResolvedValue(ok({}) as never);
    jest.mocked(getCommandBoard).mockResolvedValue(ok(board(7)) as never);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    await flush();
    expect(establishCommand).toHaveBeenCalledWith(expect.anything(), { CallId: 7, CommandDefinitionId: 3 });
    expect(useCommandStore.getState().boards['7']).toMatchObject({ isProvisional: false, board: expect.objectContaining({ Command: expect.objectContaining({ IncidentCommandId: 'ic-7' }) }) });
  });

  it('keeps optimistic rows across a refresh while their write is queued, and drops them once acknowledged', async () => {
    jest.mocked(getCommandBoard).mockResolvedValue(ok(board(7)) as never);
    useCommandStore.setState({ boards: { '7': { callId: '7', board: board(7), adHocUnits: [], adHocPersonnel: [], isProvisional: false, lastRefreshed: 1 } } });
    runtime.connectivity.setOnline(false);
    const result = await useCommandStore.getState().dispatchCommandEvent(IC_EVENT.saveObjective, {
      callId: '7',
      resolveCommandId: true,
      body: { CallId: 7, Name: 'Search floor 2', ObjectiveType: 1 },
      local: { collection: 'Objectives', idField: 'TacticalObjectiveId' },
    });
    expect(useCommandStore.getState().boards['7'].board?.Objectives).toEqual([expect.objectContaining({ TacticalObjectiveId: `local-${result.id}`, Name: 'Search floor 2' })]);
    expect((await runtime.rows())[0]).toMatchObject({ orderKey: incidentOrderKey('7') });

    runtime.connectivity.setOnline(true);
    jest.mocked(saveObjective).mockRejectedValueOnce(httpError(503));
    await runtime.outbox.drain();
    await useCommandStore.getState().refreshBoard('7');
    expect(useCommandStore.getState().boards['7'].board?.Objectives).toHaveLength(1);

    jest.mocked(saveObjective).mockResolvedValue(ok({ TacticalObjectiveId: 'obj-1' }) as never);
    jest.mocked(getCommandBoard).mockResolvedValue(ok(board(7, { Objectives: [{ TacticalObjectiveId: 'obj-1', Name: 'Search floor 2' }] as never })) as never);
    runtime.clock.advance(60_000);
    await runtime.outbox.drain();
    await flush();
    expect(saveObjective).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ IncidentCommandId: 'ic-7', Name: 'Search floor 2' }));
    expect(useCommandStore.getState().boards['7'].board?.Objectives.map((o) => o.TacticalObjectiveId)).toEqual(['obj-1']);
    expect(useCommandStore.getState().pendingLocalRows).toEqual({});
  });

  it('closes the call only after the command close settles (dependsOn), and not after a refused command close', async () => {
    useCommandStore.setState({ boards: { '7': { callId: '7', board: board(7), adHocUnits: [], adHocPersonnel: [], isProvisional: false, lastRefreshed: 1 } }, activeCallId: '7' });
    runtime.connectivity.setOnline(false);
    const result = await useCommandStore.getState().endCommand('7', { closeCall: { type: 1, notes: 'Done', sendNotification: true } });
    expect(useCommandStore.getState().boards['7']).toBeUndefined();
    expect(useCommandStore.getState().activeCallId).toBeNull();
    const rows = await runtime.rows();
    expect(rows.map((row) => row.type)).toEqual([IC_EVENT.closeCommand, IC_EVENT.closeCall]);
    expect(rows[1].dependsOn).toBe(JSON.stringify([result.command?.id]));

    jest.mocked(closeCommand).mockResolvedValue(ok({}) as never);
    jest.mocked(closeCallWith).mockResolvedValue({ Status: 'success' } as never);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    expect(jest.mocked(closeCommand).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(closeCallWith).mock.invocationCallOrder[0]);
    expect(closeCallWith).toHaveBeenCalledWith(expect.anything(), { callId: '7', type: 1, note: 'Done', sendNotification: true });

    useCommandStore.setState({ boards: { '8': { callId: '8', board: board(8), adHocUnits: [], adHocPersonnel: [], isProvisional: false, lastRefreshed: 1 } } });
    jest.mocked(closeCommand).mockRejectedValueOnce(httpError(400));
    const refused = await useCommandStore.getState().endCommand('8', { closeCall: { type: 1 } });
    expect(refused.command?.outcome).toBe('rejected');
    expect(refused.call).toBeNull();
  });

  it('syncs every board from /Sync/Bundle and persists in the frozen command-storage shape', async () => {
    jest.mocked(getSyncBundle).mockResolvedValue(ok({ ServerTimestampMs: 77, Boards: [board(7)], AdHocUnits: [{ CallId: 7, ReleasedOn: null }], AdHocPersonnel: [] }) as never);
    await useCommandStore.getState().syncFromServer();
    expect(useCommandStore.getState().boards['7'].adHocUnits).toHaveLength(1);
    expect(useCommandStore.getState().lastSyncTimestampMs).toBe(77);
    expect(Object.keys(persisted(runtime.kv, 'command-storage')?.state ?? {})).toEqual(['boards', 'activeCallId', 'lastSyncTimestampMs', 'pendingLocalRows']);
  });

  it('rehydrates legacy IC boards (no Needs) and repairs a dangling activeCallId', async () => {
    const legacy = { ...board(9) } as Record<string, unknown>;
    delete legacy.Needs;
    runtime.kv.set(
      'command-storage',
      JSON.stringify({ state: { boards: { '9': { callId: '9', board: legacy, adHocUnits: [], adHocPersonnel: [], isProvisional: false, lastRefreshed: 1 } }, activeCallId: 'gone', lastSyncTimestampMs: 5 }, version: 0 })
    );
    await setDataStorage(runtime.kv);
    expect(useCommandStore.getState().boards['9'].board?.Needs).toEqual([]);
    expect(useCommandStore.getState().activeCallId).toBe('9');
  });

  it('withPendingLocalRows only carries rows of the same call', () => {
    const merged = withPendingLocalRows('7', board(7), { e1: { eventId: 'e1', callId: '7', collection: 'Needs', row: { IncidentNeedId: 'local-e1' } }, e2: { eventId: 'e2', callId: '8', collection: 'Needs', row: {} } });
    expect(merged?.Needs).toHaveLength(1);
  });
});

describe('resource incident view (Unit view tier)', () => {
  it('treats not_found as "no command" and refetches only loaded views on ping', async () => {
    jest.mocked(getResourceIncidentView).mockResolvedValue(notFound(null) as never);
    await useResourceViewStore.getState().fetchIncidentView('7', 10);
    expect(getResourceIncidentView).toHaveBeenCalledWith(expect.anything(), { callId: '7', unitId: 10 });
    expect(useResourceViewStore.getState().viewsByCall['7']).toBeNull();
    expect(useResourceViewStore.getState().errors.view).toBeNull();
    await useResourceViewStore.getState().handleIncidentCommandUpdated('8');
    expect(getResourceIncidentView).toHaveBeenCalledTimes(1);
  });
});
