import {
  acknowledgeProtocol,
  answerWeeklyProtocolQuestion,
  ApiError,
  completeCallProtocolChecklist,
  getAllProtocols,
  getCallProtocolChecklists,
  getMyProtocolAcknowledgments,
  getProtocol,
  getProtocolVersionContent,
  getWeeklyProtocolQuestions,
  recordCallProtocolStep,
  startCallProtocolChecklist,
} from '@resgrid/api';
import type { CallProtocolChecklistResultData, ProtocolMicroLearningItem, ProtocolResultData, ProtocolVersionContentData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush } from '../../__tests__/helpers';
import { type DataLogger, type DataStepUpArea, type DataStepUpRequirement, setDataLogger, setDataStepUp } from '../../core/runtime';
import { useCallProtocolStepsStore } from '../call-protocol-steps-store';
import { mergeWeeklyAnswers, useProtocolAcknowledgmentsStore } from '../protocol-acknowledgments-store';
import { useProtocolsStore } from '../protocols-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  acknowledgeProtocol: jest.fn(),
  answerWeeklyProtocolQuestion: jest.fn(),
  completeCallProtocolChecklist: jest.fn(),
  getAllProtocols: jest.fn(),
  getCallProtocolChecklists: jest.fn(),
  getMyProtocolAcknowledgments: jest.fn(),
  getProtocol: jest.fn(),
  getProtocolVersionContent: jest.fn(),
  getWeeklyProtocolQuestions: jest.fn(),
  recordCallProtocolStep: jest.fn(),
  startCallProtocolChecklist: jest.fn(),
}));

const envelope = { PageSize: 1, Timestamp: '', Version: '', Node: '', RequestId: '', Status: 'success', Environment: '' };

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve: (value: T) => void = () => undefined;

  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
};

const checklist = (CallProtocolId: string): CallProtocolChecklistResultData =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({ CallId: '9', CallProtocolId, ProtocolId: '1', Code: 'M', Name: 'Mayday', Steps: [], Done: 0, Total: 0, CompletedOn: null }) as never;

const wire = (ProtocolId: string, CurrentVersionId: string): ProtocolResultData =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({
    ProtocolId,
    Name: `P${ProtocolId}`,
    Code: '',
    Description: '',
    ProtocolText: '',
    CreatedOn: '',
    Attachments: [],
    Questions: [],
    Triggers: [],
    CurrentVersionId,
    VersionLabel: CurrentVersionId,
  }) as never;

const content = (ProtocolVersionId: string, Locale: string, TranslationId: string | null = null): ProtocolVersionContentData =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({ ProtocolId: '1', ProtocolVersionId, Locale, TranslationId, ContentHash: 'h', IsFallback: false, ContentHtml: `<p>${Locale}</p>`, Steps: [] }) as never;

const weekly = (Id: number, AnsweredOn: string | null): ProtocolMicroLearningItem =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({ Id, AnsweredOn }) as never;

let runtime: DataTestRuntime;

beforeEach(async () => {
  jest.clearAllMocks();
  runtime = await createDataTestRuntime({ variant: 'responder' });

  for (const name of ['data.protocols', 'data.protocolAcknowledgments', 'data.callProtocolSteps']) await defaultResetRegistry.getStoreResets().get(name)?.('logout');
});

describe('call protocol steps', () => {
  it('drops a start or completion answer that lands after a reset, success or failure', async () => {
    const started = deferred<unknown>();
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(startCallProtocolChecklist).mockReturnValueOnce(started.promise as never);
    const pending = useCallProtocolStepsStore.getState().startChecklist('9', '1');
    await defaultResetRegistry.getStoreResets().get('data.callProtocolSteps')?.('logout');
    started.resolve({ ...envelope, Data: checklist('40') });
    await expect(pending).resolves.toBeNull();
    expect(useCallProtocolStepsStore.getState().checklistsByCall).toEqual({});

    const refused = deferred<unknown>();
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(startCallProtocolChecklist).mockReturnValueOnce(refused.promise.then(() => Promise.reject(new ApiError({ kind: 'http', status: 500 }))) as never);
    const failing = useCallProtocolStepsStore.getState().startChecklist('9', '1');
    await defaultResetRegistry.getStoreResets().get('data.callProtocolSteps')?.('logout');
    refused.resolve(null);
    await expect(failing).resolves.toBeNull();
    expect(useCallProtocolStepsStore.getState().actionError).toBeNull();
  });

  it('runs a refresh asked for after a write once the read in flight settles', async () => {
    const first = deferred<unknown>();
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest
      .mocked(getCallProtocolChecklists)
      .mockReturnValueOnce(first.promise as never)
      .mockResolvedValueOnce({ ...envelope, Data: [checklist('41')] } as never);
    const inFlight = useCallProtocolStepsStore.getState().fetchChecklists('9');
    const refresh = useCallProtocolStepsStore.getState().fetchChecklists('9', { bypassCache: true });
    first.resolve({ ...envelope, Data: [checklist('40')] });
    await Promise.all([inFlight, refresh]);
    expect(getCallProtocolChecklists).toHaveBeenCalledTimes(2);
    expect(useCallProtocolStepsStore.getState().checklistsByCall['9']?.map((item) => item.CallProtocolId)).toEqual(['41']);
  });

  it('sends the steps ticked before a completion first, and keeps the completion back while one is still unsent', async () => {
    runtime.connectivity.setOnline(false);
    await useCallProtocolStepsStore.getState().recordStep({ callId: '9', callProtocolId: '40', stepId: 'a', state: 1 });
    await expect(useCallProtocolStepsStore.getState().completeChecklist('9', '40')).resolves.toBeNull();
    expect(completeCallProtocolChecklist).not.toHaveBeenCalled();
    expect(useCallProtocolStepsStore.getState().actionError?.code).toBe('network');

    const order: string[] = [];
    jest.mocked(recordCallProtocolStep).mockImplementation(async () => {
      order.push('step');

      // SAFETY: a test double: it carries only the fields the code under test reads.
      return { ...envelope, Data: checklist('40'), Error: null } as never;
    });
    jest.mocked(completeCallProtocolChecklist).mockImplementation(async () => {
      order.push('complete');

      // SAFETY: a test double: it carries only the fields the code under test reads.
      return { ...envelope, Data: { ...checklist('40'), CompletedOn: '2026-11-27T10:00:00Z' } } as never;
    });
    runtime.connectivity.setOnline(true);
    await expect(useCallProtocolStepsStore.getState().completeChecklist('9', '40')).resolves.toMatchObject({ CompletedOn: '2026-11-27T10:00:00Z' });
    expect(order).toEqual(['step', 'complete']);
  });

  it('does not let a refused step hold the completion back', async () => {
    jest.mocked(recordCallProtocolStep).mockRejectedValue(new ApiError({ kind: 'http', status: 400 }));
    await expect(useCallProtocolStepsStore.getState().recordStep({ callId: '9', callProtocolId: '40', stepId: 'a', state: 1 })).resolves.toMatchObject({ outcome: 'rejected' });
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(completeCallProtocolChecklist).mockResolvedValue({ ...envelope, Data: checklist('40') } as never);
    await expect(useCallProtocolStepsStore.getState().completeChecklist('9', '40')).resolves.toMatchObject({ CallProtocolId: '40' });
  });
});

describe('protocol acknowledgments', () => {
  const requirement: DataStepUpRequirement = { area: 'acknowledgments', required: true, allowedMethods: ['mfa'], usableMethods: ['mfa'], mfaMethods: ['totp'], windowMinutes: 15, canComplete: true };
  const stepUpRefusal = () => new ApiError({ kind: 'http', status: 403, problemType: 'step_up_required' });
  const acknowledged = { Outcome: 'Acknowledged', Accepted: true, CurrentVersionId: null, CurrentContentHash: null, AcknowledgmentId: 4 };
  const requestStepUp = jest.fn<Promise<boolean>, [DataStepUpRequirement, { interactive?: boolean }?]>();
  let verifiedListener: ((area: DataStepUpArea) => void) | null = null;

  beforeEach(() => {
    verifiedListener = null;
    setDataStepUp({
      requirementOf: (error) => (error instanceof ApiError && error.problemType === 'step_up_required' ? requirement : null),
      request: requestStepUp,
      onVerified: (listener) => {
        verifiedListener = listener;

        return () => undefined;
      },
    });
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getMyProtocolAcknowledgments).mockResolvedValue({ ...envelope, Data: [] } as never);
  });

  it('sends a signing made offline as offline, with the device time, even when it is replayed seconds later', async () => {
    runtime.connectivity.setOnline(false);
    const signedAt = new Date(runtime.clock.now()).toISOString();
    await expect(useProtocolAcknowledgmentsStore.getState().acknowledge(31, 'hash')).resolves.toEqual({ kind: 'queued' });

    runtime.clock.advance(10_000);
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(acknowledgeProtocol).mockResolvedValue({ ...envelope, Data: acknowledged } as never);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    expect(acknowledgeProtocol).toHaveBeenCalledWith(expect.anything(), { ProtocolVersionId: 31, ContentHash: 'hash', Offline: true, SignedOnDevice: signedAt });
  });

  it('keeps the held signing waiting for the step-up when a later signing of the same version is discarded', async () => {
    jest.mocked(acknowledgeProtocol).mockRejectedValue(stepUpRefusal());
    requestStepUp.mockResolvedValue(false);
    await expect(useProtocolAcknowledgmentsStore.getState().acknowledge(31, 'hash')).resolves.toEqual({ kind: 'awaiting_step_up' });
    const [held] = useProtocolAcknowledgmentsStore.getState().held;

    // The second signing waits behind the held one (same order group).
    await expect(useProtocolAcknowledgmentsStore.getState().acknowledge(31, 'hash')).resolves.toEqual({ kind: 'awaiting_step_up' });
    const rows = await runtime.rows();
    const second = rows.find((row) => row.id !== held?.eventId);
    expect(second).toBeDefined();
    await runtime.outbox.discard(String(second?.id), { confirmed: true });

    expect(useProtocolAcknowledgmentsStore.getState().held).toEqual([{ protocolVersionId: 31, eventId: held?.eventId, requirement }]);
  });

  it('reports a signing refused for good after its step-up retry as failed, not queued', async () => {
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest
      .mocked(acknowledgeProtocol)
      .mockRejectedValueOnce(stepUpRefusal())
      .mockRejectedValueOnce(new ApiError({ kind: 'http', status: 400 }));
    requestStepUp.mockResolvedValue(true);
    await expect(useProtocolAcknowledgmentsStore.getState().acknowledge(31, 'hash')).resolves.toEqual({ kind: 'failed' });
    expect(useProtocolAcknowledgmentsStore.getState().held).toEqual([]);
  });

  it('logs a failed retry of the held signings after a verification instead of rejecting unhandled', async () => {
    const warn = jest.fn();
    const logger: DataLogger = { debug: jest.fn(), info: jest.fn(), warn, error: jest.fn() };
    setDataLogger(logger);
    jest.mocked(acknowledgeProtocol).mockRejectedValue(stepUpRefusal());
    requestStepUp.mockResolvedValue(false);
    await useProtocolAcknowledgmentsStore.getState().acknowledge(31, 'hash');

    jest.spyOn(runtime.outbox, 'drain').mockRejectedValueOnce(new Error('db closed'));
    verifiedListener?.('acknowledgments');
    await flush();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ operation: 'retryHeldAcknowledgments', count: 1 }) }));
  });

  it('never hands the outstanding list to a caller that asked for the completed ones too', async () => {
    const owed = deferred<unknown>();
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest
      .mocked(getMyProtocolAcknowledgments)
      .mockReturnValueOnce(owed.promise as never)
      .mockResolvedValueOnce({ ...envelope, Data: [{ AcknowledgmentId: 5, Status: 'acknowledged' }] } as never);
    const outstanding = useProtocolAcknowledgmentsStore.getState().fetchAcknowledgments();
    const all = useProtocolAcknowledgmentsStore.getState().fetchAcknowledgments({ includeCompleted: true });
    await all;
    expect(getMyProtocolAcknowledgments).toHaveBeenLastCalledWith(expect.anything(), { includeCompleted: true });
    owed.resolve({ ...envelope, Data: [{ AcknowledgmentId: 4, Status: 'open' }] });
    await outstanding;
    // The request made last wins the shared list.
    expect(useProtocolAcknowledgmentsStore.getState().acknowledgments.map((item) => item.AcknowledgmentId)).toEqual([5]);
  });

  it('keeps a weekly answer accepted while an older read of the questions was in flight', async () => {
    useProtocolAcknowledgmentsStore.setState({ weekly: [weekly(3, null)] });
    const read = deferred<unknown>();
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getWeeklyProtocolQuestions).mockReturnValueOnce(read.promise as never);
    const fetching = useProtocolAcknowledgmentsStore.getState().fetchWeekly();
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(answerWeeklyProtocolQuestion).mockResolvedValue({ ...envelope, Data: weekly(3, '2026-11-27T10:00:00Z'), Error: 'None' } as never);
    await useProtocolAcknowledgmentsStore.getState().answerWeekly(3, ['a']);
    read.resolve({ ...envelope, Data: [weekly(3, null), weekly(4, null)] });
    await fetching;
    expect(useProtocolAcknowledgmentsStore.getState().weekly.map((item) => [item.Id, item.AnsweredOn])).toEqual([
      [3, '2026-11-27T10:00:00Z'],
      [4, null],
    ]);
    expect(mergeWeeklyAnswers([weekly(3, '2026-11-27T11:00:00Z')], [weekly(3, '2026-11-27T10:00:00Z')])[0]?.AnsweredOn).toBe('2026-11-27T11:00:00Z');
  });
});

describe('protocol library', () => {
  it('does not let an older detail answer bring back the version a newer list read replaced', async () => {
    const detail = deferred<unknown>();
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getProtocol).mockReturnValueOnce(detail.promise as never);
    const reading = useProtocolsStore.getState().fetchProtocol('1');
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getAllProtocols).mockResolvedValue({ ...envelope, Data: [wire('1', '32')] } as never);
    await useProtocolsStore.getState().fetchProtocols();
    detail.resolve({ ...envelope, Data: wire('1', '31') });
    await reading;
    expect(useProtocolsStore.getState().libraryById['1']?.CurrentVersionId).toBe('32');
    expect(useProtocolsStore.getState().protocolDetailsById['1']).toBeDefined();

    // A detail read that starts after the list still fills or updates its entry.
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getProtocol).mockResolvedValueOnce({ ...envelope, Data: wire('2', '50') } as never);
    await useProtocolsStore.getState().fetchProtocol('2');
    expect(useProtocolsStore.getState().libraryById['2']?.CurrentVersionId).toBe('50');
  });

  it('does not write back a version a library refresh pruned while it was being read', async () => {
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getAllProtocols).mockResolvedValueOnce({ ...envelope, Data: [wire('1', '31')] } as never);
    await useProtocolsStore.getState().fetchProtocols();
    const read = deferred<unknown>();
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getProtocolVersionContent).mockReturnValueOnce(read.promise as never);
    const reading = useProtocolsStore.getState().fetchVersionContent('31', { locale: 'en' });
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getAllProtocols).mockResolvedValueOnce({ ...envelope, Data: [wire('1', '32')] } as never);
    await useProtocolsStore.getState().fetchProtocols({ bypassCache: true });
    read.resolve({ ...envelope, Data: content('31', 'en') });
    // The reader still gets what it asked for; the device does not keep it.
    await expect(reading).resolves.toMatchObject({ ProtocolVersionId: '31' });
    expect(useProtocolsStore.getState().versionContentById).toEqual({});
  });

  it('keeps the language asked for last when an earlier language answers after it', async () => {
    const english = deferred<unknown>();
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest
      .mocked(getProtocolVersionContent)
      .mockReturnValueOnce(english.promise as never)
      .mockResolvedValueOnce({ ...envelope, Data: content('31', 'fr', 't-fr') } as never);
    const first = useProtocolsStore.getState().fetchVersionContent('31', { locale: 'en' });
    await useProtocolsStore.getState().fetchVersionContent('31', { locale: 'fr' });
    english.resolve({ ...envelope, Data: content('31', 'en') });
    await first;
    expect(useProtocolsStore.getState().versionContentById['31']?.Locale).toBe('fr');
  });

  it('reads the source for a request without a language instead of answering with a stored translation', async () => {
    useProtocolsStore.setState({ versionContentById: { '31': content('31', 'fr', 't-fr') } });
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getProtocolVersionContent).mockResolvedValueOnce({ ...envelope, Data: content('31', 'en') } as never);
    await expect(useProtocolsStore.getState().fetchVersionContent('31')).resolves.toMatchObject({ Locale: 'en' });
    expect(getProtocolVersionContent).toHaveBeenCalledWith(expect.anything(), { protocolVersionId: '31' });

    // The stored source copy answers a source request; a failed source read falls back to whatever copy is stored.
    await expect(useProtocolsStore.getState().fetchVersionContent('31')).resolves.toMatchObject({ Locale: 'en' });
    expect(getProtocolVersionContent).toHaveBeenCalledTimes(1);
    useProtocolsStore.setState({ versionContentById: { '31': content('31', 'fr', 't-fr') } });
    jest.mocked(getProtocolVersionContent).mockRejectedValueOnce(new ApiError({ kind: 'network' }));
    await expect(useProtocolsStore.getState().fetchVersionContent('31')).resolves.toMatchObject({ Locale: 'fr' });
  });
});
