import { acknowledgeUnitStatusAlert, ApiError, clearUnitStatusAlert, getActiveUnitStatusAlertAcknowledgements } from '@resgrid/api';
import type { UnitStatusAlertAcknowledgementResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, networkError, ok, persisted } from '../../__tests__/helpers';
import { useUnitStatusAlertsStore } from '../unit-status-alerts-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getActiveUnitStatusAlertAcknowledgements: jest.fn(),
  acknowledgeUnitStatusAlert: jest.fn(),
  clearUnitStatusAlert: jest.fn(),
}));

const ack = (UnitId: string, extra: Partial<UnitStatusAlertAcknowledgementResultData> = {}): UnitStatusAlertAcknowledgementResultData =>
  ({ UnitStatusAlertAcknowledgementId: `k${UnitId}`, UnitId, UnitStateId: 10, Level: 1, Mode: 0, MutedUntilUtc: null, Note: null, ClearedOnUtc: null, ...extra }) as UnitStatusAlertAcknowledgementResultData;
const refusal = (status: number, Error: string, Data: unknown = null) => new ApiError({ kind: 'http', status, data: { Error, Data } });
const input = { UnitId: 7, UnitStateId: 10, Level: 1, Mode: 0, MuteMinutes: 0, Note: 'Pump fault' };

let runtime: DataTestRuntime;

beforeEach(async () => {
  jest.mocked(getActiveUnitStatusAlertAcknowledgements).mockReset();
  jest.mocked(acknowledgeUnitStatusAlert).mockReset();
  jest.mocked(clearUnitStatusAlert).mockReset();
  runtime = await createDataTestRuntime({ variant: 'bigboard' });
  await defaultResetRegistry.getStoreResets().get('data.unit-status-alerts')?.('logout');
});

describe('unit status alerts store (BigBoard acknowledgements)', () => {
  it('loads acknowledgements keyed by unit and persists them for offline boards', async () => {
    jest.mocked(getActiveUnitStatusAlertAcknowledgements).mockResolvedValue(ok([ack('7'), ack('9', { Mode: 1 })]) as never);
    await useUnitStatusAlertsStore.getState().fetchAcknowledgements();
    expect(Object.keys(useUnitStatusAlertsStore.getState().acknowledgements).sort()).toEqual(['7', '9']);
    expect(Object.keys((persisted(runtime.kv, 'omni-unit-status-alerts-storage')?.state.acknowledgements as object) ?? {})).toHaveLength(2);
  });

  it('keeps what it shows when a refresh fails', async () => {
    useUnitStatusAlertsStore.setState({ acknowledgements: { '7': ack('7') } });
    jest.mocked(getActiveUnitStatusAlertAcknowledgements).mockRejectedValue(networkError());
    await useUnitStatusAlertsStore.getState().fetchAcknowledgements();
    expect(useUnitStatusAlertsStore.getState().acknowledgements['7']).toBeDefined();
    expect(useUnitStatusAlertsStore.getState().errors.acknowledgements?.code).toBe('network');
  });

  it('acknowledges online (nothing is queued) and stores the answer', async () => {
    jest.mocked(acknowledgeUnitStatusAlert).mockResolvedValue({ Status: 'success', Error: null, Data: ack('7', { Note: 'Pump fault' }) } as never);
    await expect(useUnitStatusAlertsStore.getState().acknowledge(input)).resolves.toEqual({ ok: true });
    expect(acknowledgeUnitStatusAlert).toHaveBeenCalledWith(expect.anything(), input);
    expect(useUnitStatusAlertsStore.getState().acknowledgements['7']?.Note).toBe('Pump fault');
    expect(await runtime.rows()).toHaveLength(0);
  });

  it('turns refusals into outcomes: conflict shows the winner, a changed status drops the row', async () => {
    jest.mocked(acknowledgeUnitStatusAlert).mockRejectedValueOnce(refusal(409, 'unit_alert_conflict', ack('7', { AcknowledgedByName: 'Sam' })));
    await expect(useUnitStatusAlertsStore.getState().acknowledge(input)).resolves.toEqual({ ok: false, error: 'unit_alert_conflict' });
    expect(useUnitStatusAlertsStore.getState().acknowledgements['7']?.AcknowledgedByName).toBe('Sam');

    jest.mocked(acknowledgeUnitStatusAlert).mockRejectedValueOnce(refusal(400, 'unit_alert_status_changed'));
    await expect(useUnitStatusAlertsStore.getState().acknowledge(input)).resolves.toEqual({ ok: false, error: 'unit_alert_status_changed' });
    expect(useUnitStatusAlertsStore.getState().acknowledgements['7']).toBeUndefined();

    jest.mocked(acknowledgeUnitStatusAlert).mockRejectedValueOnce(networkError());
    await expect(useUnitStatusAlertsStore.getState().acknowledge(input)).resolves.toEqual({ ok: false, error: 'offline' });
    jest.mocked(acknowledgeUnitStatusAlert).mockRejectedValueOnce(new ApiError({ kind: 'http', status: 500 }));
    await expect(useUnitStatusAlertsStore.getState().acknowledge(input)).resolves.toEqual({ ok: false, error: 'unknown' });
  });

  it('clears an acknowledgement; one already gone counts as cleared', async () => {
    useUnitStatusAlertsStore.setState({ acknowledgements: { '7': ack('7'), '9': ack('9') } });
    jest.mocked(clearUnitStatusAlert).mockResolvedValueOnce({ Status: 'success', Error: null, Data: null } as never);
    await expect(useUnitStatusAlertsStore.getState().clear(ack('7'))).resolves.toEqual({ ok: true });
    expect(clearUnitStatusAlert).toHaveBeenCalledWith(expect.anything(), { id: 'k7' });
    jest.mocked(clearUnitStatusAlert).mockRejectedValueOnce(refusal(404, 'unit_alert_not_found'));
    await expect(useUnitStatusAlertsStore.getState().clear(ack('9'))).resolves.toEqual({ ok: true });
    expect(useUnitStatusAlertsStore.getState().acknowledgements).toEqual({});
  });

  it('does not let a list fetched before a local write bring back what was just handled', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    jest
      .mocked(getActiveUnitStatusAlertAcknowledgements)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)) as never)
      .mockResolvedValueOnce(ok([ack('7', { Note: 'fresh' })]) as never);
    const fetching = useUnitStatusAlertsStore.getState().fetchAcknowledgements();
    jest.mocked(acknowledgeUnitStatusAlert).mockResolvedValue({ Status: 'success', Error: null, Data: ack('7', { Note: 'mine' }) } as never);
    await useUnitStatusAlertsStore.getState().acknowledge(input);
    resolveFirst(ok([]));
    await fetching;
    expect(getActiveUnitStatusAlertAcknowledgements).toHaveBeenCalledTimes(2);
    expect(useUnitStatusAlertsStore.getState().acknowledgements['7']?.Note).toBe('fresh');
  });

  it('is wiped on logout', async () => {
    useUnitStatusAlertsStore.setState({ acknowledgements: { '7': ack('7') } });
    await defaultResetRegistry.getStoreResets().get('data.unit-status-alerts')?.('logout');
    expect(useUnitStatusAlertsStore.getState().acknowledgements).toEqual({});
  });
});
