import {
  acknowledgeProtocol,
  answerWeeklyProtocolQuestion,
  ApiError,
  getAllProtocols,
  getLmsLessonLaunch,
  getLmsLessonPlaylist,
  getMyLmsAccess,
  getMyProtocolAcknowledgments,
  getProtocolCategories,
  getProtocolVersionContent,
  recordCallProtocolStep,
  submitExternalTraining,
} from '@resgrid/api';
import type { CallProtocolChecklistResultData, ProtocolResultData, ProtocolVersionContentData } from '@resgrid/models';
import { defaultResetRegistry, type OutboxEvent } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush } from '../../__tests__/helpers';
import { type DataStepUpArea, type DataStepUpRequirement, setDataStepUp } from '../../core/runtime';
import { refusalCodeOf, retainCourses, retainTrainings, useTrainingStore } from '../../training/training-store';
import { type ProtocolStepPayload, protocolStepRecordHandler, useCallProtocolStepsStore, withQueuedSteps } from '../call-protocol-steps-store';
import { selectOwedAcknowledgment, useProtocolAcknowledgmentsStore } from '../protocol-acknowledgments-store';
import { toLibraryEntry } from '../protocol-wire';
import { retainCurrentVersions, useProtocolsStore } from '../protocols-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getMyLmsAccess: jest.fn(),
  getLmsLessonLaunch: jest.fn(),
  getLmsLessonPlaylist: jest.fn(),
  answerWeeklyProtocolQuestion: jest.fn(),
  getProtocolCategories: jest.fn(),
  getAllProtocols: jest.fn(),
  getProtocolVersionContent: jest.fn(),
  getMyProtocolAcknowledgments: jest.fn(),
  acknowledgeProtocol: jest.fn(),
  recordCallProtocolStep: jest.fn(),
  submitExternalTraining: jest.fn(),
}));

const envelope = { PageSize: 1, Timestamp: '', Version: '', Node: '', RequestId: '', Status: 'success', Environment: '' };

const wire = (ProtocolId: string, extra: Partial<ProtocolResultData> = {}): ProtocolResultData =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({
    ProtocolId,
    DepartmentId: 1,
    Name: `P${ProtocolId}`,
    Code: '',
    IsDisabled: false,
    Description: '',
    ProtocolText: '',
    CreatedOn: '',
    CreatedByUserId: '',
    UpdatedOn: null,
    MinimumWeight: 0,
    UpdatedByUserId: '',
    Triggers: [],
    Attachments: [],
    Questions: [],
    State: 0,
    ...extra,
  }) as ProtocolResultData;

const content = (ProtocolVersionId: string): ProtocolVersionContentData =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({
    ProtocolId: '1',
    ProtocolVersionId,
    Label: '2',
    EffectiveOn: null,
    ContentHash: 'h',
    Locale: 'en',
    TranslationId: null,
    TranslationContentHash: null,
    IsFallback: false,
    AvailableLocales: [],
    ContentHtml: '<p>x</p>',
    ContentJson: null,
    DosingToolUrl: null,
    DeepLink: null,
    Steps: [],
  }) as ProtocolVersionContentData;

const checklist = (steps: { Id: string; State: number }[]): CallProtocolChecklistResultData =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({
    CallId: '9',
    CallProtocolId: '40',
    ProtocolId: '1',
    Code: 'M',
    Name: 'Mayday',
    Kind: 4,
    IsIncidentSop: true,
    ProtocolVersionId: '3',
    VersionLabel: '1',
    StartedOn: null,
    StartedByUserId: null,
    CompletedOn: null,
    CompletedByUserId: null,
    Done: 0,
    Total: steps.length,
    Steps: steps.map((step, index) => ({ ...step, Text: step.Id, Kind: null, Group: null, Anchor: null, Order: index, At: null, ByUserId: null, Note: null })),
  }) as CallProtocolChecklistResultData;

let runtime: DataTestRuntime;

beforeEach(async () => {
  jest.clearAllMocks();
  runtime = await createDataTestRuntime({ variant: 'responder' });

  for (const name of ['data.protocols', 'data.protocolAcknowledgments', 'data.callProtocolSteps', 'data.training']) await defaultResetRegistry.getStoreResets().get(name)?.('logout');
});

describe('protocol library store', () => {
  it('keeps each protocol kind, version in force and attachment sizes, and drops version copies no longer in force', async () => {
    expect(
      toLibraryEntry(wire('1', { Kind: 1, CurrentVersionId: '31', VersionLabel: '3', Number: 'SOG-1', Attachments: [{ ProtocolTriggerAttachmentId: 'a', FileName: 'f.pdf', FileType: 'application/pdf', Size: 9 }] }))
    ).toMatchObject({
      Kind: 1,
      CurrentVersionId: '31',
      Number: 'SOG-1',
      Attachments: [{ Id: 'a', Size: 9 }],
    });
    const current = toLibraryEntry(wire('1', { CurrentVersionId: '31' }));
    expect(retainCurrentVersions({ '31': content('31'), '30': content('30') }, current ? { '1': current } : {})).toEqual({ '31': content('31') });

    useProtocolsStore.setState({ versionContentById: { '30': content('30') } });
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getAllProtocols).mockResolvedValue({ ...envelope, Data: [wire('1', { CurrentVersionId: '31' })] } as never);
    await useProtocolsStore.getState().fetchProtocols();
    expect(useProtocolsStore.getState().libraryById['1']?.CurrentVersionId).toBe('31');
    expect(useProtocolsStore.getState().versionContentById).toEqual({});
  });

  it('reads a version in the reader language and falls back to the stored copy when the read fails', async () => {
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getProtocolVersionContent).mockResolvedValueOnce({ ...envelope, Data: content('31') } as never);
    await expect(useProtocolsStore.getState().fetchVersionContent('31', { locale: 'de' })).resolves.toMatchObject({ ProtocolVersionId: '31' });
    expect(getProtocolVersionContent).toHaveBeenCalledWith(expect.anything(), { protocolVersionId: '31', locale: 'de' });
    jest.mocked(getProtocolVersionContent).mockRejectedValueOnce(new ApiError({ kind: 'network' }));
    await expect(useProtocolsStore.getState().fetchVersionContent('31', { bypassCache: true })).resolves.toMatchObject({ ProtocolVersionId: '31' });
  });
});

describe('protocol acknowledgments store', () => {
  const acknowledged = { Outcome: 'Acknowledged', Accepted: true, CurrentVersionId: null, CurrentContentHash: null, AcknowledgmentId: 4 };

  const stepUpProblem = {
    type: 'step_up_required',
    title: 'Verify it is you to continue.',
    status: 403,
    area: 'acknowledgments',
    required: true,
    allowedMethods: ['mfa', 'sso', 'password'],
    usableMethods: ['mfa', 'password'],
    mfaMethods: ['totp', 'passkey'],
    windowMinutes: 15,
    canComplete: true,
  };

  const stepUpRefusal = () => new ApiError({ kind: 'http', status: 403, problemType: 'step_up_required', data: stepUpProblem });

  const requirement: DataStepUpRequirement = {
    area: 'acknowledgments',
    required: true,
    allowedMethods: ['mfa', 'sso', 'password'],
    usableMethods: ['mfa', 'password'],
    mfaMethods: ['totp', 'passkey'],
    windowMinutes: 15,
    canComplete: true,
  };

  // The app shell hands @resgrid/auth's parser, sheet and "verified" signal to the data layer; here, a fake of each.
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
    jest.mocked(getMyProtocolAcknowledgments).mockResolvedValue({ ...envelope, Data: [{ AcknowledgmentId: 4, ProtocolId: 1, ProtocolVersionId: 31, Status: 'acknowledged' }] } as never);
  });

  it('signs with the version and hash read, then reads the list again', async () => {
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(acknowledgeProtocol).mockResolvedValue({ ...envelope, Data: acknowledged } as never);
    const outcome = await useProtocolAcknowledgmentsStore.getState().acknowledge(31, 'hash');
    expect(acknowledgeProtocol).toHaveBeenCalledWith(expect.anything(), { ProtocolVersionId: 31, ContentHash: 'hash', Offline: false, SignedOnDevice: null });
    expect(outcome).toEqual({ kind: 'answered', data: acknowledged });
    expect(requestStepUp).not.toHaveBeenCalled();
    await flush();
    const list = useProtocolAcknowledgmentsStore.getState().acknowledgments;
    expect(list).toHaveLength(1);
    expect(selectOwedAcknowledgment(list, 1)).toBeNull();
    expect(selectOwedAcknowledgment([{ ...list[0], Status: 'open' }], '1')?.AcknowledgmentId).toBe(4);
    expect(await runtime.rows()).toEqual([]);
  });

  it('asks for the step-up in the app when the department requires it, then sends the same signing again', async () => {
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest
      .mocked(acknowledgeProtocol)
      .mockRejectedValueOnce(stepUpRefusal())
      .mockResolvedValue({ ...envelope, Data: acknowledged } as never);
    requestStepUp.mockResolvedValue(true);
    const outcome = await useProtocolAcknowledgmentsStore.getState().acknowledge(31, 'hash');
    expect(requestStepUp).toHaveBeenCalledTimes(1);
    // Interactive: the member just tapped sign, so a sheet they closed earlier opens again.
    expect(requestStepUp).toHaveBeenCalledWith(requirement, undefined);
    expect(acknowledgeProtocol).toHaveBeenCalledTimes(2);
    // Verified at once, it is still the member's online read.
    expect(jest.mocked(acknowledgeProtocol).mock.calls[1]?.[1]).toEqual({ ProtocolVersionId: 31, ContentHash: 'hash', Offline: false, SignedOnDevice: null });
    expect(outcome).toEqual({ kind: 'answered', data: acknowledged });
    expect(useProtocolAcknowledgmentsStore.getState().held).toEqual([]);
    expect(await runtime.rows()).toEqual([]);
  });

  it('holds a signing the member did not verify for, never drops it, and sends it with the device time once verified anywhere', async () => {
    const signedAt = new Date(runtime.clock.now()).toISOString();
    jest.mocked(acknowledgeProtocol).mockRejectedValue(stepUpRefusal());
    requestStepUp.mockResolvedValue(false);
    await expect(useProtocolAcknowledgmentsStore.getState().acknowledge(31, 'hash')).resolves.toEqual({ kind: 'awaiting_step_up' });
    expect(useProtocolAcknowledgmentsStore.getState().held).toEqual([{ protocolVersionId: 31, eventId: expect.any(String), requirement }]);

    // Background replays (long after the read) keep it: never dead-lettered, and they never reopen a sheet the member closed.
    for (let pass = 0; pass < 12; pass++) {
      runtime.clock.advance(60 * 60 * 1000);
      await runtime.outbox.drain();
    }

    const rows = await runtime.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'protocols.acknowledge', state: 'failed' });
    expect(requestStepUp).toHaveBeenLastCalledWith(requirement, { interactive: false });

    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(acknowledgeProtocol).mockResolvedValue({ ...envelope, Data: acknowledged } as never);
    verifiedListener?.('signatures');
    await flush();
    expect(await runtime.rows()).toHaveLength(1);
    verifiedListener?.('acknowledgments');
    await flush(20);
    expect(await runtime.rows()).toEqual([]);
    expect(jest.mocked(acknowledgeProtocol).mock.calls.at(-1)?.[1]).toEqual({ ProtocolVersionId: 31, ContentHash: 'hash', Offline: true, SignedOnDevice: signedAt });
    expect(useProtocolAcknowledgmentsStore.getState().held).toEqual([]);
    expect(useProtocolAcknowledgmentsStore.getState().outcomes[31]).toEqual(acknowledged);
  });

  it('queues a signing made offline and replays it with the device time, asking for a step-up only if the member has not closed it', async () => {
    runtime.connectivity.setOnline(false);
    const signedAt = new Date(runtime.clock.now()).toISOString();
    await expect(useProtocolAcknowledgmentsStore.getState().acknowledge(31, 'hash')).resolves.toEqual({ kind: 'queued' });
    expect(acknowledgeProtocol).not.toHaveBeenCalled();

    runtime.clock.advance(5 * 60 * 1000);
    jest.mocked(acknowledgeProtocol).mockRejectedValueOnce(stepUpRefusal());
    requestStepUp.mockResolvedValue(true);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    expect(acknowledgeProtocol).toHaveBeenCalledWith(expect.anything(), { ProtocolVersionId: 31, ContentHash: 'hash', Offline: true, SignedOnDevice: signedAt });
    expect(requestStepUp).toHaveBeenCalledWith(requirement, { interactive: false });

    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(acknowledgeProtocol).mockResolvedValue({ ...envelope, Data: acknowledged } as never);
    await expect(useProtocolAcknowledgmentsStore.getState().verifyHeld(31)).resolves.toBe(true);
    expect(await runtime.rows()).toEqual([]);
    expect(useProtocolAcknowledgmentsStore.getState().held).toEqual([]);
  });

  it('dead-letters a signing Core refuses for another reason, without asking for a step-up', async () => {
    jest.mocked(acknowledgeProtocol).mockRejectedValue(new ApiError({ kind: 'http', status: 409 }));
    await expect(useProtocolAcknowledgmentsStore.getState().acknowledge(31, 'hash')).resolves.toEqual({ kind: 'failed' });
    expect(requestStepUp).not.toHaveBeenCalled();
    expect(useProtocolAcknowledgmentsStore.getState().held).toEqual([]);
  });
});

describe('call protocol steps', () => {
  const event = (state: 0 | 1 | 2 | 3): OutboxEvent<ProtocolStepPayload> =>
    // SAFETY: a test double: it carries only the fields the code under test reads.
    ({
      id: 'evt-1',
      type: 'protocols.step.record',
      payload: { callId: '9', callProtocolId: '40', stepId: 'a', state, deviceTimestamp: '2026-11-26T10:00:00.000Z' },
      createdAt: 1,
    }) as never;

  it('shows a queued step at once and sends it once, with its device time and the outbox id as ClientStepId', async () => {
    useCallProtocolStepsStore.setState({
      checklistsByCall: {
        '9': [
          checklist([
            { Id: 'a', State: 0 },
            { Id: 'b', State: 0 },
          ]),
        ],
      },
      callOrder: ['9'],
    });
    await protocolStepRecordHandler.optimisticApply?.(event(1));
    const shown = withQueuedSteps(useCallProtocolStepsStore.getState().checklistsByCall['9'] ?? [], useCallProtocolStepsStore.getState().queuedSteps);
    expect(shown[0]?.Steps?.[0]).toMatchObject({ Id: 'a', State: 1, At: '2026-11-26T10:00:00.000Z' });
    expect(shown[0]?.Done).toBe(1);

    const saved = checklist([
      { Id: 'a', State: 1 },
      { Id: 'b', State: 0 },
    ]);

    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(recordCallProtocolStep).mockResolvedValue({ ...envelope, Data: saved, Error: null } as never);
    // SAFETY: a test double: it carries only the fields the code under test reads.
    const result = await protocolStepRecordHandler.send(event(1), { idempotencyKey: 'evt-1' } as never);
    expect(recordCallProtocolStep).toHaveBeenCalledWith(expect.anything(), { CallId: 9, CallProtocolId: 40, StepId: 'a', State: 1, DeviceTimestamp: '2026-11-26T10:00:00.000Z', ClientStepId: 'evt-1' });
    await protocolStepRecordHandler.afterAck?.(event(1), result);
    expect(useCallProtocolStepsStore.getState().queuedSteps).toEqual([]);
    expect(useCallProtocolStepsStore.getState().checklistsByCall['9']?.[0]?.Steps?.[0]?.State).toBe(1);
  });

  it('marks a refused step instead of showing it as done, and drops a discarded one', async () => {
    await protocolStepRecordHandler.optimisticApply?.(event(2));
    // SAFETY: a test double: it carries only the fields the code under test reads.
    await protocolStepRecordHandler.rollback?.(event(2), 'rejected' as never);
    expect(useCallProtocolStepsStore.getState().queuedSteps[0]?.rejected).toBe(true);
    expect(withQueuedSteps([checklist([{ Id: 'a', State: 0 }])], useCallProtocolStepsStore.getState().queuedSteps)[0]?.Steps?.[0]?.State).toBe(0);
    // SAFETY: a test double: it carries only the fields the code under test reads.
    await protocolStepRecordHandler.rollback?.(event(2), 'discarded' as never);
    expect(useCallProtocolStepsStore.getState().queuedSteps).toEqual([]);
  });
});

describe('training store', () => {
  it('keeps offline copies only for current assignments, catalog items and enrollments', () => {
    // SAFETY: a test double: it carries only the fields the code under test reads.
    const detail = { TrainingId: 1 } as never;
    // SAFETY: a test double: it carries only the fields the code under test reads.
    expect(Object.keys(retainTrainings({ 1: detail, 2: detail }, { Assignments: [{ TrainingId: 1 }], Catalog: [], Certifications: [], OnLeave: false } as never))).toEqual(['1']);
    // SAFETY: a test double: it carries only the fields the code under test reads.
    expect(Object.keys(retainCourses({ 5: {} as never, 6: {} as never }, [{ EnrollmentId: 6 }] as never))).toEqual(['6']);
  });

  it('surfaces the refusal code a v4 400 answer carries', async () => {
    jest.mocked(submitExternalTraining).mockRejectedValueOnce(new ApiError({ kind: 'http', status: 400, data: { Error: 'file_type_not_allowed', Status: 'failure' } }));
    const outcome = await useTrainingStore.getState().submitExternal({ Title: 'T', CompletedOn: '2026-11-01T12:00:00Z', Hours: 1 });
    expect(outcome).toEqual({ value: null, error: 'file_type_not_allowed' });
    expect(refusalCodeOf(new ApiError({ kind: 'http', status: 400, data: { Error: '<script>' } }))).toBeNull();
    jest.mocked(submitExternalTraining).mockRejectedValueOnce(new ApiError({ kind: 'network' }));
    await expect(useTrainingStore.getState().submitExternal({ Title: 'T', CompletedOn: '2026-11-01T12:00:00Z', Hours: 1 })).resolves.toEqual({ value: null, error: 'network' });
  });
});

describe('round 10 learner reads', () => {
  it('keeps the member LMS access, maps a refused playlist to its code, and the department categories', async () => {
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getMyLmsAccess).mockResolvedValue({ ...envelope, Data: { TrainingModuleOn: true, LmsFlagOn: true, AddonActive: true, IsLapsed: false, CanBeTrained: false, EnhancedAiActive: false } } as never);
    await expect(useTrainingStore.getState().fetchAccess()).resolves.toMatchObject({ CanBeTrained: false });
    expect(useTrainingStore.getState().access?.CanBeTrained).toBe(false);

    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getLmsLessonPlaylist).mockResolvedValue({ ...envelope, Status: 'failure', Error: 'NotLicensed', Data: null } as never);
    await expect(useTrainingStore.getState().getLessonPlaylist(5, 2)).resolves.toEqual({ value: null, error: 'NotLicensed' });

    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getProtocolCategories).mockResolvedValue({ ...envelope, Data: [{ CategoryId: 5, Name: 'Fire', ParentId: null, SortOrder: 1, Kind: null }] } as never);
    await useProtocolsStore.getState().fetchCategories();
    expect(useProtocolsStore.getState().categories).toHaveLength(1);
  });

  it('hands a SCORM / cmi5 / LTI launch straight to the player (never into the store), with the item asked for, and maps its refusals', async () => {
    const data = { Kind: 'Scorm2004', LaunchUrl: 'https://resgrid.com/lms-app/launch?token=t', ExpiresOn: '2026-11-26T12:05:00Z', CompletionMessage: { Origin: 'https://resgrid.com' } };
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getLmsLessonLaunch).mockResolvedValueOnce({ ...envelope, Error: null, Data: data } as never);
    await expect(useTrainingStore.getState().getLessonLaunch(5, 9, 'sco-2')).resolves.toEqual({ value: data, error: null });
    expect(getLmsLessonLaunch).toHaveBeenCalledWith(expect.anything(), { enrollmentId: 5, lessonId: 9, item: 'sco-2' });
    expect(JSON.stringify(useTrainingStore.getState())).not.toContain('token=t');

    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(getLmsLessonLaunch).mockResolvedValueOnce({ ...envelope, Status: 'failure', Error: 'LapseWindowEnded', Data: null } as never);
    await expect(useTrainingStore.getState().getLessonLaunch(5, 9)).resolves.toEqual({ value: null, error: 'LapseWindowEnded' });
    expect(getLmsLessonLaunch).toHaveBeenLastCalledWith(expect.anything(), { enrollmentId: 5, lessonId: 9 });

    jest.mocked(getLmsLessonLaunch).mockRejectedValueOnce(new ApiError({ kind: 'http', status: 429, data: { Error: 'RateLimited' } }));
    await expect(useTrainingStore.getState().getLessonLaunch(5, 9)).resolves.toEqual({ value: null, error: 'RateLimited' });
    jest.mocked(getLmsLessonLaunch).mockRejectedValueOnce(new ApiError({ kind: 'http', status: 404 }));
    await expect(useTrainingStore.getState().getLessonLaunch(5, 9)).resolves.toEqual({ value: null, error: 'not_found' });
  });

  it('replaces an answered weekly question with the server copy', async () => {
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useProtocolAcknowledgmentsStore.setState({
      weekly: [
        { Id: 3, AnsweredOn: null },
        { Id: 4, AnsweredOn: null },
      ] as never,
    });
    // SAFETY: a test double: it carries only the fields the code under test reads.
    jest.mocked(answerWeeklyProtocolQuestion).mockResolvedValue({ ...envelope, Data: { Id: 3, AnsweredOn: '2026-11-26T10:00:00Z', Correct: true }, Error: 'None' } as never);
    await useProtocolAcknowledgmentsStore.getState().answerWeekly(3, ['a']);
    expect(answerWeeklyProtocolQuestion).toHaveBeenCalledWith(expect.anything(), { Id: 3, Keys: ['a'] });
    expect(useProtocolAcknowledgmentsStore.getState().weekly.map((item) => item.AnsweredOn)).toEqual(['2026-11-26T10:00:00Z', null]);
  });
});
