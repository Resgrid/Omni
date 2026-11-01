import { closeIncidentChannels, createIncidentChannel, getAllCommandDefinitions, getCommandBoard, getIncidentVoiceChannels, getMyIncidentCapabilities, transferCommand } from '@resgrid/api';
import type { IncidentCommandBoard } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, failure, ok } from '../../__tests__/helpers';
import { useCommandStore } from '../command-store';
import { useCommandSupportStore } from '../command-support-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getMyIncidentCapabilities: jest.fn(),
  getAllCommandDefinitions: jest.fn(),
  getIncidentVoiceChannels: jest.fn(),
  createIncidentChannel: jest.fn(),
  closeIncidentChannels: jest.fn(),
  transferCommand: jest.fn(),
  getCommandBoard: jest.fn(),
  getAdHocUnits: jest.fn(async () => ({ Data: [], Status: 'success' })),
  getAdHocPersonnel: jest.fn(async () => ({ Data: [], Status: 'success' })),
}));

const board = (callId: number): IncidentCommandBoard =>
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
  }) as unknown as IncidentCommandBoard;

beforeEach(async () => {
  await createDataTestRuntime({ variant: 'ic' });
  for (const name of ['data.incident-command', 'data.incident-command-support']) await defaultResetRegistry.getStoreResets().get(name)?.('logout');
});

describe('command support store', () => {
  it('reads the effective capability bitmask per incident (0 when the server sends none)', async () => {
    jest.mocked(getMyIncidentCapabilities).mockResolvedValueOnce(ok({ Value: 9, Capabilities: ['ViewBoard', 'AssignResources'] }) as never);
    await useCommandSupportStore.getState().fetchCapabilities('7');
    expect(getMyIncidentCapabilities).toHaveBeenCalledWith(expect.anything(), { callId: 7 });
    expect(useCommandSupportStore.getState().capabilitiesByCall['7']).toBe(9);

    jest.mocked(getMyIncidentCapabilities).mockResolvedValueOnce({ Data: null, Status: 'not_found' } as never);
    await useCommandSupportStore.getState().fetchCapabilities('8', { bypassCache: true });
    expect(useCommandSupportStore.getState().capabilitiesByCall['8']).toBe(0);
  });

  it('keeps a failed capability read unloaded and records the error', async () => {
    jest.mocked(getMyIncidentCapabilities).mockResolvedValueOnce(failure() as never);
    await useCommandSupportStore.getState().fetchCapabilities('7');
    expect(useCommandSupportStore.getState().capabilitiesByCall['7']).toBeUndefined();
    expect(useCommandSupportStore.getState().errors.capabilities).toBeTruthy();
  });

  it('loads command templates', async () => {
    jest.mocked(getAllCommandDefinitions).mockResolvedValueOnce(ok([{ CommandDefinitionId: 3, Name: 'Structure fire', Lanes: [] }]) as never);
    await useCommandSupportStore.getState().fetchCommandDefinitions();
    expect(useCommandSupportStore.getState().definitions).toEqual([expect.objectContaining({ CommandDefinitionId: 3 })]);
  });

  it('lists open voice channels, creates one (refreshing the list) and closes them all', async () => {
    jest.mocked(getIncidentVoiceChannels).mockResolvedValueOnce(
      ok([
        { DepartmentVoiceChannelId: 'v1', Name: 'Tac 1', IsOnDemand: true, DepartmentId: 1 },
        { DepartmentVoiceChannelId: 'v0', Name: 'Old', IsOnDemand: true, DepartmentId: 1, ClosedOn: '2026-10-31T10:00:00Z' },
      ]) as never
    );
    await useCommandSupportStore.getState().fetchVoiceChannels('7');
    expect(useCommandSupportStore.getState().voiceChannelsByCall['7'].map((channel) => channel.DepartmentVoiceChannelId)).toEqual(['v1']);

    jest.mocked(createIncidentChannel).mockResolvedValueOnce(ok({ DepartmentVoiceChannelId: 'v2', Name: 'Command', IsOnDemand: true, DepartmentId: 1 }) as never);
    jest.mocked(getIncidentVoiceChannels).mockResolvedValueOnce(ok([{ DepartmentVoiceChannelId: 'v2', Name: 'Command', IsOnDemand: true, DepartmentId: 1 }]) as never);
    const channel = await useCommandSupportStore.getState().createVoiceChannel('7', 'Command');
    expect(createIncidentChannel).toHaveBeenCalledWith(expect.anything(), { CallId: 7, Name: 'Command' });
    expect(channel?.DepartmentVoiceChannelId).toBe('v2');
    expect(useCommandSupportStore.getState().voiceChannelsByCall['7']).toHaveLength(1);

    jest.mocked(closeIncidentChannels).mockResolvedValueOnce(ok(true) as never);
    await useCommandSupportStore.getState().closeVoiceChannels('7');
    expect(useCommandSupportStore.getState().voiceChannelsByCall['7']).toEqual([]);
  });

  it('throws a refused channel create so the screen can explain it', async () => {
    jest.mocked(createIncidentChannel).mockResolvedValueOnce(failure() as never);
    await expect(useCommandSupportStore.getState().createVoiceChannel('7', 'Tac')).rejects.toThrow();
  });
});

describe('transfer command (online only)', () => {
  it('transfers the server command and refreshes the board', async () => {
    useCommandStore.setState({ boards: { '7': { callId: '7', board: board(7), adHocUnits: [], adHocPersonnel: [], isProvisional: false, lastRefreshed: 1 } }, activeCallId: '7' });
    jest.mocked(transferCommand).mockResolvedValueOnce(ok({ CommandTransferId: 't1' }) as never);
    jest.mocked(getCommandBoard).mockResolvedValue(ok(board(7)) as never);
    await useCommandSupportStore.getState().transferCommand('7', 'u2', ' Shift change ');
    expect(transferCommand).toHaveBeenCalledWith(expect.anything(), { IncidentCommandId: 'ic-7', ToUserId: 'u2', Notes: 'Shift change' });
    expect(getCommandBoard).toHaveBeenCalledWith(expect.anything(), { callId: '7' });
  });

  it('refuses a provisional command and surfaces a server refusal', async () => {
    useCommandStore.setState({ boards: { '7': { callId: '7', board: null, adHocUnits: [], adHocPersonnel: [], isProvisional: true, lastRefreshed: null } } });
    await expect(useCommandSupportStore.getState().transferCommand('7', 'u2')).rejects.toThrow();
    expect(transferCommand).not.toHaveBeenCalled();

    useCommandStore.setState({ boards: { '7': { callId: '7', board: board(7), adHocUnits: [], adHocPersonnel: [], isProvisional: false, lastRefreshed: 1 } } });
    jest.mocked(transferCommand).mockResolvedValueOnce(failure() as never);
    await expect(useCommandSupportStore.getState().transferCommand('7', 'u2')).rejects.toThrow();
  });
});
