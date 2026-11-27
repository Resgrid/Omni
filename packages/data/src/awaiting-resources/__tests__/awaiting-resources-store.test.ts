import { dismissRequirement, dispatchUnitToAwaitingCall, getAwaitingCalls, getAwaitingResourceResponseCodes, getCallRequirements } from '@resgrid/api';
import { AwaitingResourcesActionResult, OutstandingRequirementsAlertKind } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, httpError, networkError, ok, persisted } from '../../__tests__/helpers';
import { activeResponseCodes, parseOutstandingRequirementsAlert } from '../awaiting-resources-alerts';
import { awaitingDismissKey, awaitingDispatchKey, MAX_UNIT_ALERTS, pruneUnitAlerts, useAwaitingResourcesStore } from '../awaiting-resources-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getAwaitingCalls: jest.fn(),
  getAwaitingResourceResponseCodes: jest.fn(),
  getCallRequirements: jest.fn(),
  dismissRequirement: jest.fn(),
  dispatchUnitToAwaitingCall: jest.fn(),
}));

const call = (CallId: number) => ({ CallId, CallNumber: `C-${CallId}`, CallName: 'Fire', Priority: 1, PriorityName: 'High', PriorityColor: '#f00', Address: '1 Main', LoggedOn: '2026-10-31T11:00:00', Requirements: [] });

const alertPayload = (kind: number, unitId: number, callIds: number[]) =>
  JSON.stringify({ kind, unitId, unitName: `M-${unitId}`, unitTypeName: 'MUG', message: 'M available', calls: callIds.map((callId) => ({ callId, callNumber: `C-${callId}`, priority: 1, ageMinutes: 6 })) });

const actionResult = (fields: Partial<AwaitingResourcesActionResult>): AwaitingResourcesActionResult => Object.assign(new AwaitingResourcesActionResult(), { Status: 'success', Success: true }, fields);

/** A request the test answers when it chooses. */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve: (value: T) => void = () => undefined;

  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
};

/** Sign-out: the reset every data store registers. */
const resetStore = async () => defaultResetRegistry.getStoreResets().get('data.awaiting-resources')?.('logout');

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'dispatch' });
  await resetStore();
  jest.mocked(getAwaitingCalls).mockResolvedValue({ Enabled: true, Data: [call(1), call(2)], Status: 'success' } as never);
});

describe('awaiting-resources helpers', () => {
  it('parses the camel-cased push, tolerating objects and rejecting junk', () => {
    expect(parseOutstandingRequirementsAlert(alertPayload(1, 9, [1, -2]))).toMatchObject({ kind: OutstandingRequirementsAlertKind.UnitAvailable, unitId: 9, calls: [{ callId: 1, ageMinutes: 6 }] });
    expect(parseOutstandingRequirementsAlert({ kind: 99 })?.kind).toBe(OutstandingRequirementsAlertKind.Changed);
    expect(parseOutstandingRequirementsAlert('not json')).toBeNull();
    expect(parseOutstandingRequirementsAlert('')).toBeNull();
    expect(parseOutstandingRequirementsAlert([1])).toBeNull();
  });

  it('orders pickable codes and leaves retired ones out', () => {
    const codes = [
      { Id: 1, Code: 'C3', SortOrder: 2, Retired: false },
      { Id: 2, Code: 'C2', SortOrder: 1, Retired: false },
      { Id: 3, Code: 'C1', SortOrder: 0, Retired: true },
    ] as never;

    expect(activeResponseCodes(codes).map((code) => code.Code)).toEqual(['C2', 'C3']);
  });

  it('prunes alerts to calls still waiting', () => {
    const alert = { id: 'unit-1', unitId: 1, unitName: null, unitTypeName: null, message: null, receivedAt: 0, calls: [{ callId: 1 }, { callId: 3 }] } as never;
    expect(pruneUnitAlerts([alert], [call(1)] as never)[0].calls).toHaveLength(1);
    expect(pruneUnitAlerts([alert], [] as never)).toEqual([]);
  });
});

describe('awaiting-resources store', () => {
  it('loads waiting calls, persists them, and treats Enabled=false as none', async () => {
    await useAwaitingResourcesStore.getState().fetchAwaitingCalls();
    expect(useAwaitingResourcesStore.getState().calls).toHaveLength(2);
    expect(persisted(runtime.kv, 'omni-awaiting-resources-storage')?.state.calls).toHaveLength(2);

    jest.mocked(getAwaitingCalls).mockResolvedValueOnce({ Enabled: false, Data: [call(1)], Status: 'success' } as never);
    await useAwaitingResourcesStore.getState().fetchAwaitingCalls({ bypassCache: true });
    expect(useAwaitingResourcesStore.getState().calls).toEqual([]);
  });

  it('keeps the last list when a refresh fails', async () => {
    await useAwaitingResourcesStore.getState().fetchAwaitingCalls();
    jest.mocked(getAwaitingCalls).mockRejectedValueOnce(networkError());
    await useAwaitingResourcesStore.getState().fetchAwaitingCalls({ bypassCache: true });
    expect(useAwaitingResourcesStore.getState().calls).toHaveLength(2);
    expect(useAwaitingResourcesStore.getState().errors.calls?.code).toBe('network');
  });

  it('loads the response code catalog once unless forced', async () => {
    jest.mocked(getAwaitingResourceResponseCodes).mockResolvedValue(
      ok({
        Codes: [
          { Id: 1, Code: 'C3', SortOrder: 0, Retired: false },
          { Id: 2, Code: 'X', SortOrder: 1, Retired: true },
        ],
        ShowToCrews: true,
      }) as never
    );
    await useAwaitingResourcesStore.getState().fetchResponseCodes();
    await useAwaitingResourcesStore.getState().fetchResponseCodes();
    expect(getAwaitingResourceResponseCodes).toHaveBeenCalledTimes(1);
    const state = useAwaitingResourcesStore.getState();
    expect(state.responseCodes).toHaveLength(1);
    expect(state.allResponseCodes).toHaveLength(2);
    expect(state.showCodesToCrews).toBe(true);
    await useAwaitingResourcesStore.getState().fetchResponseCodes(true);
    expect(getAwaitingResourceResponseCodes).toHaveBeenCalledTimes(2);
  });

  it('adds one alert per unit (newest first, capped), drops it on auto-dispatch, and always refreshes', async () => {
    await useAwaitingResourcesStore.getState().fetchAwaitingCalls();

    for (let unit = 1; unit <= MAX_UNIT_ALERTS + 1; unit++) useAwaitingResourcesStore.getState().handleOutstandingRequirementsUpdated('0', alertPayload(1, unit, [1]));
    useAwaitingResourcesStore.getState().handleOutstandingRequirementsUpdated('0', alertPayload(1, 6, [2]));
    let alerts = useAwaitingResourcesStore.getState().unitAlerts;
    expect(alerts).toHaveLength(MAX_UNIT_ALERTS);
    expect(alerts[0]).toMatchObject({ unitId: 6, calls: [{ callId: 2 }] });

    const parsed = useAwaitingResourcesStore.getState().handleOutstandingRequirementsUpdated('0', alertPayload(OutstandingRequirementsAlertKind.AutoDispatched, 6, [2]));
    expect(parsed?.kind).toBe(OutstandingRequirementsAlertKind.AutoDispatched);
    alerts = useAwaitingResourcesStore.getState().unitAlerts;
    expect(alerts.some((alert) => alert.unitId === 6)).toBe(false);
    expect(useAwaitingResourcesStore.getState().lastPushAt).toBeGreaterThan(0);
    await flush();
    expect(jest.mocked(getAwaitingCalls).mock.calls.length).toBeGreaterThan(1);
    // An older server: the call id alone still refreshes.
    expect(useAwaitingResourcesStore.getState().handleOutstandingRequirementsUpdated('12')).toBeNull();
  });

  it('dispatches a unit to a waiting call, spends its alert and returns the server message', async () => {
    useAwaitingResourcesStore.getState().handleOutstandingRequirementsUpdated('0', alertPayload(1, 4, [1]));
    jest.mocked(dispatchUnitToAwaitingCall).mockResolvedValueOnce({ Success: true, Message: 'M-4 added to C-1', Resolved: 1, Status: 'success' } as never);
    const outcome = await useAwaitingResourcesStore.getState().dispatchUnit(1, 4);
    expect(dispatchUnitToAwaitingCall).toHaveBeenCalledWith(expect.anything(), { CallId: 1, UnitId: 4 });
    expect(outcome).toEqual({ ok: true, message: 'M-4 added to C-1', error: null });
    expect(useAwaitingResourcesStore.getState().unitAlerts).toEqual([]);
    expect(useAwaitingResourcesStore.getState().busyKeys).toEqual([]);

    jest.mocked(dispatchUnitToAwaitingCall).mockRejectedValueOnce(httpError(403));
    expect((await useAwaitingResourcesStore.getState().dispatchUnit(1, 4)).error?.code).toBe('forbidden');
  });

  it('keeps each action busy until that action finishes, and joins a second press on the same row', async () => {
    const dispatch = deferred<AwaitingResourcesActionResult>();
    const dismiss = deferred<AwaitingResourcesActionResult>();

    jest.mocked(dispatchUnitToAwaitingCall).mockReturnValueOnce(dispatch.promise);
    jest.mocked(dismissRequirement).mockReturnValueOnce(dismiss.promise);
    const dispatching = useAwaitingResourcesStore.getState().dispatchUnit(1, 4);
    const dismissing = useAwaitingResourcesStore.getState().dismissRequirement(2, 5);
    const dispatchingAgain = useAwaitingResourcesStore.getState().dispatchUnit(1, 4);

    expect(useAwaitingResourcesStore.getState().busyKeys).toEqual([awaitingDispatchKey(1, 4), awaitingDismissKey(5)]);
    expect(dispatchUnitToAwaitingCall).toHaveBeenCalledTimes(1);

    dismiss.resolve(actionResult({}));
    await dismissing;

    // The dismiss finishing first leaves the dispatch's button off, so a second press cannot page the unit again.
    expect(useAwaitingResourcesStore.getState().busyKeys).toEqual([awaitingDispatchKey(1, 4)]);

    dispatch.resolve(actionResult({ Message: 'M-4 added to C-1' }));

    expect(await dispatching).toEqual({ ok: true, message: 'M-4 added to C-1', error: null });
    expect(await dispatchingAgain).toEqual({ ok: true, message: 'M-4 added to C-1', error: null });
    expect(useAwaitingResourcesStore.getState().busyKeys).toEqual([]);
    expect(dispatchUnitToAwaitingCall).toHaveBeenCalledTimes(1);
  });

  it('leaves the next session alone when an action lands after sign-out', async () => {
    const before = deferred<AwaitingResourcesActionResult>();
    const after = deferred<AwaitingResourcesActionResult>();

    jest.mocked(dispatchUnitToAwaitingCall).mockReturnValueOnce(before.promise);
    const dispatching = useAwaitingResourcesStore.getState().dispatchUnit(1, 4);

    await resetStore();
    // The next session: a fresh alert offers the same unit and the dispatcher sends it, a new request of its own.
    useAwaitingResourcesStore.getState().handleOutstandingRequirementsUpdated('0', alertPayload(1, 4, [1]));
    await flush();
    jest.mocked(dispatchUnitToAwaitingCall).mockReturnValueOnce(after.promise);
    const dispatchingAfter = useAwaitingResourcesStore.getState().dispatchUnit(1, 4);

    expect(dispatchUnitToAwaitingCall).toHaveBeenCalledTimes(2);
    jest.mocked(getAwaitingCalls).mockClear();

    before.resolve(actionResult({}));
    await dispatching;
    await flush();

    expect(useAwaitingResourcesStore.getState().busyKeys).toEqual([awaitingDispatchKey(1, 4)]);
    expect(useAwaitingResourcesStore.getState().unitAlerts).toHaveLength(1);
    expect(getAwaitingCalls).not.toHaveBeenCalled();

    after.resolve(actionResult({}));
    await dispatchingAfter;

    expect(useAwaitingResourcesStore.getState().busyKeys).toEqual([]);
    expect(useAwaitingResourcesStore.getState().unitAlerts).toEqual([]);
  });

  it('loads a call’s requirements and removes a dismissed one', async () => {
    jest.mocked(getCallRequirements).mockResolvedValueOnce(ok([{ CallOutstandingRequirementId: 5, CallId: 1, Label: 'MUG' }]) as never);
    await useAwaitingResourcesStore.getState().fetchCallRequirements('1');
    expect(useAwaitingResourcesStore.getState().requirementsByCall['1']).toHaveLength(1);

    jest.mocked(dismissRequirement).mockResolvedValueOnce({ Success: true, Message: null, Resolved: 0, Status: 'success' } as never);
    const outcome = await useAwaitingResourcesStore.getState().dismissRequirement(1, 5, 'Not needed');
    expect(dismissRequirement).toHaveBeenCalledWith(expect.anything(), { CallId: 1, RequirementId: 5, Note: 'Not needed' });
    expect(outcome.ok).toBe(true);
    expect(useAwaitingResourcesStore.getState().requirementsByCall['1']).toEqual([]);
  });

  it('disable() drops everything', async () => {
    await useAwaitingResourcesStore.getState().fetchAwaitingCalls();
    useAwaitingResourcesStore.getState().disable();
    expect(useAwaitingResourcesStore.getState().calls).toEqual([]);
  });
});
