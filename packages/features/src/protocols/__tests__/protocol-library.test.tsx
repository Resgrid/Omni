import '../../calls/__tests__/test-setup';

import { setFileOpener } from '@resgrid/core/device/file-opener';
import { type ProtocolLibraryEntry, useCallProtocolStepsStore, useProtocolAcknowledgmentsStore, useProtocolsStore, useTrainingStore } from '@resgrid/data';
import type { CallProtocolChecklistResultData, CallProtocolsResultData, ProtocolAcknowledgmentResultData, ProtocolVersionContentData } from '@resgrid/models';
import { ProtocolStepState } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { bankQuizQuestions, trainingQuizQuestions } from '../components/acknowledgment-panel';
import { CallProtocolSteps, nextStepState } from '../components/call-protocol-steps';
import { FileList } from '../components/file-list';
import { isQuizComplete, QuizForm, toggleQuizKey } from '../components/quiz-form';
import {
  acknowledgeOutcomeKey,
  acknowledgmentStatusKey,
  categoriesInLibrary,
  documentFile,
  filterLibrary,
  groupSteps,
  isDocumentVersion,
  kindsInLibrary,
  protocolDisplayHtml,
  protocolKindKey,
  stepStateKey,
} from '../lib/protocol-library';
import ProtocolDetailScreen from '../screens/protocol-detail';
import ProtocolListScreen from '../screens/protocol-list';

const protocol = (Id: string, overrides: Partial<CallProtocolsResultData> = {}): CallProtocolsResultData =>
  // SAFETY: a test double: it carries only the fields the code under test reads.
  ({
    Id,
    DepartmentId: '1',
    Name: `Protocol ${Id}`,
    Code: `P${Id}`,
    Description: '',
    ProtocolText: '<p>Old text</p>',
    CreatedOn: '2026-10-01T00:00:00Z',
    CreatedByUserId: '',
    IsDisabled: false,
    UpdatedOn: '',
    UpdatedByUserId: '',
    MinimumWeight: 0,
    State: 0,
    Triggers: [],
    Attachments: [],
    Questions: [],
    ...overrides,
  }) as CallProtocolsResultData;

const entry = (Id: string, Kind = 0, extra: Partial<ProtocolLibraryEntry> = {}): ProtocolLibraryEntry => ({
  Id,
  Kind,
  Number: null,
  CurrentVersionId: `v${Id}`,
  VersionLabel: '3',
  EffectiveOn: '2026-11-01T00:00:00Z',
  RequiresAcknowledgment: false,
  CategoryId: null,
  Attachments: [],
  ...extra,
});

const content = (versionId: string, overrides: Partial<ProtocolVersionContentData> = {}): ProtocolVersionContentData => ({
  ProtocolId: '1',
  ProtocolVersionId: versionId,
  Label: '3',
  EffectiveOn: '2026-11-01T00:00:00Z',
  ContentHash: 'hash-3',
  Locale: 'en',
  TranslationId: null,
  TranslationContentHash: null,
  IsFallback: false,
  AvailableLocales: ['en'],
  ContentHtml: '<p>Version three</p>',
  ContentJson: null,
  DosingToolUrl: null,
  DeepLink: null,
  Steps: [],
  ...overrides,
});

const ack = (overrides: Partial<ProtocolAcknowledgmentResultData> = {}): ProtocolAcknowledgmentResultData => ({
  AcknowledgmentId: 7,
  ProtocolId: 1,
  ProtocolVersionId: 31,
  Code: 'P1',
  Name: 'Protocol 1',
  Kind: 1,
  IsBulletin: false,
  VersionLabel: '3',
  ContentHash: 'hash-3',
  Status: 'open',
  IsOverdue: false,
  AssignedOn: '2026-11-20T00:00:00Z',
  DueOn: '2026-12-01T00:00:00Z',
  SignedOn: null,
  EffectiveOn: null,
  ExpiresOn: null,
  BundleOrder: 0,
  QuizTrainingId: null,
  QuizTrainingName: null,
  QuizPassed: false,
  IsDocument: false,
  BankQuizOwed: false,
  ...overrides,
});

const step = (Id: string, Order: number, State = 0, Group: string | null = null) => ({ Id, Text: `Step ${Id}`, Kind: 'step', Group, Anchor: null, Order, State, At: null, ByUserId: null, Note: null });

const checklist = (overrides: Partial<CallProtocolChecklistResultData> = {}): CallProtocolChecklistResultData => ({
  CallId: '9',
  CallProtocolId: '40',
  ProtocolId: '1',
  Code: 'MAY',
  Name: 'Mayday',
  Kind: 4,
  IsIncidentSop: true,
  ProtocolVersionId: '31',
  VersionLabel: '2',
  StartedOn: null,
  StartedByUserId: null,
  CompletedOn: null,
  CompletedByUserId: null,
  Done: 0,
  Total: 2,
  Steps: [step('a', 1), step('b', 2)],
  ...overrides,
});

const mockFetchVersionContent = jest.fn();
const mockAcknowledge = jest.fn();
const mockVerifyHeld = jest.fn();
const mockStartBankQuiz = jest.fn();
const mockSubmitBankQuiz = jest.fn();

beforeEach(() => {
  activateVariant('responder');
  jest.mocked(router.push).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: '1' });
  useToastStore.getState().clearToasts();
  mockFetchVersionContent.mockReset().mockResolvedValue(null);
  mockAcknowledge.mockReset().mockResolvedValue({ kind: 'answered', data: { Outcome: 'Acknowledged', Accepted: true, CurrentVersionId: null, CurrentContentHash: null, AcknowledgmentId: 7 } });
  mockVerifyHeld.mockReset().mockResolvedValue(true);
  mockStartBankQuiz.mockReset();
  mockSubmitBankQuiz.mockReset();
  useProtocolsStore.setState({
    protocols: [protocol('1'), protocol('2', { Name: 'Hazmat entry', Code: 'HZ' })],
    protocolDetailsById: {},
    libraryById: { '1': entry('1', 1, { Number: 'SOG-204' }), '2': entry('2', 4) },
    versionContentById: { v1: content('v1'), '31': content('31') },
    loading: {},
    errors: {},
    fetchProtocols: jest.fn(async () => undefined),
    fetchProtocol: jest.fn(async () => null),
    fetchVersionContent: mockFetchVersionContent,
    categories: [],
    fetchCategories: jest.fn(async () => undefined),
  });
  useProtocolAcknowledgmentsStore.setState({
    acknowledgments: [],
    loading: {},
    errors: {},
    fetchAcknowledgments: jest.fn(async () => undefined),
    acknowledge: mockAcknowledge,
    verifyHeld: mockVerifyHeld,
    held: [],
    startBankQuiz: mockStartBankQuiz,
    submitBankQuiz: mockSubmitBankQuiz,
  });
});

describe('protocol library helpers', () => {
  it('filters by kind, number and text, and lists the kinds the library holds', () => {
    const { protocols, libraryById } = useProtocolsStore.getState();
    expect(filterLibrary(protocols, libraryById, 'sog-204').map((item) => item.Id)).toEqual(['1']);
    expect(filterLibrary(protocols, libraryById, '', 4).map((item) => item.Id)).toEqual(['2']);
    expect(filterLibrary([...protocols, protocol('3', { IsDisabled: true })], {}, '').map((item) => item.Id)).toEqual(['1', '2']);
    expect(kindsInLibrary(libraryById, protocols)).toEqual([1, 4]);
    expect(protocolKindKey(6)).toBe('protocols.kinds.bulletin');
    expect(protocolKindKey(undefined)).toBe('protocols.kinds.dispatch');
  });

  it('tells a document version from a content version and prefers the version text', () => {
    expect(isDocumentVersion(content('1', { ContentHtml: null, Steps: [] }))).toBe(true);
    expect(isDocumentVersion(content('1'))).toBe(false);
    expect(isDocumentVersion(content('1'), ack({ IsDocument: true }))).toBe(true);
    expect(isDocumentVersion(undefined)).toBe(false);
    expect(protocolDisplayHtml(protocol('1'), content('1'))).toBe('<p>Version three</p>');
    expect(protocolDisplayHtml(protocol('1'), null)).toBe('<p>Old text</p>');
  });

  it('names statuses, step states and acknowledgment outcomes', () => {
    expect(acknowledgmentStatusKey(ack({ IsOverdue: true }))).toBe('protocols.ack.status_overdue');
    expect(acknowledgmentStatusKey(ack({ Status: 'awaiting_quiz' }))).toBe('protocols.ack.status_quiz');
    expect(stepStateKey(ProtocolStepState.NotApplicable)).toBe('protocols.steps.state_na');
    expect(acknowledgeOutcomeKey('ReadNewerVersion')).toBe('protocols.ack.newer_version');
    expect(acknowledgeOutcomeKey('Whatever')).toBe('protocols.ack.failed');
  });

  it('groups steps in order and sends a tapped state back to pending', () => {
    expect(groupSteps([step('b', 2, 0, 'Size-up'), step('a', 1, 0, 'Size-up'), step('c', 3, 0, 'Entry')]).map((group) => [group.group, group.steps.map((item) => item.Id)])).toEqual([
      ['Size-up', ['a', 'b']],
      ['Entry', ['c']],
    ]);
    expect(nextStepState(ProtocolStepState.Done, ProtocolStepState.Done)).toBe(ProtocolStepState.Pending);
    expect(nextStepState(ProtocolStepState.Pending, ProtocolStepState.Skipped)).toBe(ProtocolStepState.Skipped);
  });

  it('maps both quiz shapes and checks completeness without knowing the key', () => {
    const bank = bankQuizQuestions({
      AttemptId: 1,
      ProtocolId: 1,
      ProtocolVersionId: 31,
      ProtocolCode: 'P1',
      ProtocolName: 'P',
      VersionLabel: '3',
      PassMark: 80,
      Questions: [{ QuestionId: 5, Kind: 1, Text: 'Q', ImageUrl: null, Points: 1, Options: [{ Key: 'a', Text: 'A' }] }],
    });

    expect(bank).toEqual([{ id: '5', text: 'Q', multiple: true, options: [{ key: 'a', text: 'A' }] }]);
    expect(trainingQuizQuestions({ MinimumScore: 70, OneQuestionPerPage: false, AttemptLimit: null, Questions: [{ QuestionId: 2, Text: 'T', Type: 0, Options: [{ OptionId: 9, Text: 'Nine' }] }] })).toEqual([
      { id: '2', text: 'T', multiple: false, options: [{ key: '9', text: 'Nine' }] },
    ]);
    expect(toggleQuizKey(['a'], 'b', false)).toEqual(['b']);
    expect(toggleQuizKey(['a'], 'a', true)).toEqual([]);
    expect(isQuizComplete(bank, { keys: { '5': [] }, texts: {} })).toBe(false);
    expect(isQuizComplete([{ id: '1', text: 'W', multiple: false, freeText: true, options: [] }], { keys: {}, texts: { '1': '  ok ' } })).toBe(true);
  });
});

describe('protocol categories and document versions', () => {
  it('filters by department category and lists only the categories in use, in their order', () => {
    const entries = { '1': entry('1', 1, { CategoryId: 5 }), '2': entry('2', 4, { CategoryId: 6 }) };
    const { protocols } = useProtocolsStore.getState();
    expect(filterLibrary(protocols, entries, '', null, 6).map((item) => item.Id)).toEqual(['2']);

    const categories = [
      { CategoryId: 6, Name: 'Hazmat', ParentId: null, SortOrder: 2, Kind: null },
      { CategoryId: 5, Name: 'Fire', ParentId: null, SortOrder: 1, Kind: null },
      { CategoryId: 7, Name: 'Unused', ParentId: null, SortOrder: 0, Kind: null },
    ];

    expect(categoriesInLibrary(categories, entries).map((category) => category.Name)).toEqual(['Fire', 'Hazmat']);
  });

  it('trusts Core on document versions and names the file as Core does', () => {
    expect(isDocumentVersion(content('1', { IsDocument: true }))).toBe(true);
    expect(isDocumentVersion(content('1', { IsDocument: false, ContentHtml: null, Steps: [] }))).toBe(false);
    expect(documentFile(content('1', { DocumentFileName: 'SOG-12.docx', DocumentContentType: 'application/msword', DocumentSize: 900 }), '31', 'P1')).toEqual({
      id: '31',
      name: 'SOG-12.docx',
      type: 'application/msword',
      size: 900,
    });
    expect(documentFile(null, '31', 'P1')).toEqual({ id: '31', name: 'P1.pdf', type: 'application/pdf', size: null });
  });

  it('shows category chips beside the kind chips when the department uses categories', async () => {
    useProtocolsStore.setState({
      libraryById: { '1': entry('1', 1, { CategoryId: 5 }), '2': entry('2', 4, { CategoryId: 6 }) },
      categories: [
        { CategoryId: 5, Name: 'Fire', ParentId: null, SortOrder: 1, Kind: null },
        { CategoryId: 6, Name: 'Hazmat', ParentId: null, SortOrder: 2, Kind: null },
      ],
      fetchCategories: jest.fn(async () => undefined),
    });
    await render(<ProtocolListScreen />);
    expect(screen.getByTestId('protocol-categories', hidden)).toBeTruthy();
    await fireEvent.press(screen.getByText('Hazmat', hidden));
    expect(screen.queryByTestId('protocol-card-1', hidden)).toBeNull();
    expect(screen.getByTestId('protocol-card-2', hidden)).toBeTruthy();
  });
});

describe('QuizForm', () => {
  it('submits the picked keys once every question is answered', async () => {
    const onSubmit = jest.fn();
    await render(
      <QuizForm
        questions={[
          {
            id: '1',
            text: 'Q1',
            multiple: false,
            options: [
              { key: 'x', text: 'X' },
              { key: 'y', text: 'Y' },
            ],
          },
        ]}
        onSubmit={onSubmit}
        testID="quiz"
      />
    );
    await fireEvent.press(screen.getByTestId('quiz-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('quiz-option-1-y'));
    await fireEvent.press(screen.getByTestId('quiz-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ keys: { '1': ['y'] }, texts: {} });
  });
});

describe('ProtocolListScreen with acknowledgments', () => {
  it('shows the library with kind chips and version stamps, and the acknowledgments the member owes', async () => {
    useProtocolAcknowledgmentsStore.setState({ acknowledgments: [ack(), ack({ AcknowledgmentId: 8, ProtocolId: 2, Status: 'acknowledged' })] });
    await render(<ProtocolListScreen />);
    expect(screen.getByTestId('protocol-kinds', hidden)).toBeTruthy();
    expect(screen.getByTestId('protocol-card-1-meta', hidden).props.children).toContain('SOG-204');
    await fireEvent.press(screen.getByText('protocols.tabs.acknowledgments', hidden));
    expect(screen.getByTestId('protocol-ack-7', hidden)).toBeTruthy();
    expect(screen.queryByTestId('protocol-ack-8', hidden)).toBeNull();
    await fireEvent.press(screen.getByTestId('protocol-ack-7', hidden));
    expect(router.push).toHaveBeenCalledWith('/protocols/1');
  });

  it('keeps BigBoard to the library', async () => {
    activateVariant('bigboard');
    useProtocolAcknowledgmentsStore.setState({ acknowledgments: [ack()] });
    await render(<ProtocolListScreen />);
    expect(screen.queryByTestId('protocol-acks', hidden)).toBeNull();
    expect(screen.getByTestId('protocol-list', hidden)).toBeTruthy();
  });
});

describe('ProtocolDetailScreen', () => {
  it('reads the version in force in the reader language, with its stamp, offline badge, steps and attachments', async () => {
    useProtocolsStore.setState({
      libraryById: { '1': entry('1', 1, { Attachments: [{ Id: 'f1', FileName: 'map.pdf', FileType: 'application/pdf', Size: 2048 }] }) },
      versionContentById: { v1: content('v1', { Steps: [step('s1', 1, 0, 'Arrival')] }) },
    });
    await render(<ProtocolDetailScreen />);
    expect(mockFetchVersionContent).toHaveBeenCalledWith('v1', { locale: 'en' });
    expect(screen.getByTestId('protocol-version-stamp', hidden)).toBeTruthy();
    expect(screen.getByTestId('protocol-offline-badge', hidden)).toBeTruthy();
    expect(screen.getByTestId('protocol-steps', hidden)).toBeTruthy();
    expect(screen.getByTestId('protocol-files-f1', hidden)).toBeTruthy();
    expect(screen.queryByTestId('protocol-acknowledgment', hidden)).toBeNull();
  });

  it('shows the owed version and signs it with that version and its content hash', async () => {
    useProtocolAcknowledgmentsStore.setState({ acknowledgments: [ack()] });
    await render(<ProtocolDetailScreen />);
    expect(mockFetchVersionContent).toHaveBeenCalledWith('31', { locale: 'en' });
    await fireEvent.press(screen.getByTestId('protocol-acknowledgment-sign', hidden));
    await waitFor(() => expect(mockAcknowledge).toHaveBeenCalledWith(31, 'hash-3'));
    await waitFor(() => expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('protocols.ack.done'));
  });

  it('says a signing is kept for the step-up, shows it held, and verifies in the app', async () => {
    mockAcknowledge.mockResolvedValue({ kind: 'awaiting_step_up' });
    useProtocolAcknowledgmentsStore.setState({ acknowledgments: [ack()] });
    await render(<ProtocolDetailScreen />);
    await fireEvent.press(screen.getByTestId('protocol-acknowledgment-sign', hidden));
    await waitFor(() => expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('protocols.ack.awaiting_step_up'));

    const requirement = { area: 'acknowledgments' as const, required: true, allowedMethods: ['mfa'], usableMethods: ['mfa'], mfaMethods: ['totp'], windowMinutes: 15, canComplete: true };
    await act(async () => useProtocolAcknowledgmentsStore.setState({ held: [{ protocolVersionId: 31, eventId: 'evt-1', requirement }] }));
    expect(screen.getByTestId('protocol-acknowledgment-held', hidden)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('protocol-acknowledgment-verify', hidden));
    expect(mockVerifyHeld).toHaveBeenCalledWith(31);
  });

  it('tells the member a signing made offline is saved and will be sent', async () => {
    mockAcknowledge.mockResolvedValue({ kind: 'queued' });
    useProtocolAcknowledgmentsStore.setState({ acknowledgments: [ack()] });
    await render(<ProtocolDetailScreen />);
    await fireEvent.press(screen.getByTestId('protocol-acknowledgment-sign', hidden));
    await waitFor(() => expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('protocols.ack.queued'));
  });

  it('runs the question-bank quiz a version waits for and sends the picked keys', async () => {
    useProtocolAcknowledgmentsStore.setState({ acknowledgments: [ack({ Status: 'awaiting_quiz', BankQuizOwed: true })] });
    mockStartBankQuiz.mockResolvedValue({
      quiz: {
        AttemptId: 70,
        ProtocolId: 1,
        ProtocolVersionId: 31,
        ProtocolCode: 'P1',
        ProtocolName: 'P',
        VersionLabel: '3',
        PassMark: 80,
        Questions: [{ QuestionId: 5, Kind: 0, Text: 'Q', ImageUrl: null, Points: 1, Options: [{ Key: 'k1', Text: 'A' }] }],
      },
      error: null,
    });
    mockSubmitBankQuiz.mockResolvedValue({ result: { AttemptId: 70, ProtocolVersionId: 31, Percent: 100, PassMark: 80, Passed: true, Correct: 1, Total: 1, AcknowledgmentCompleted: true }, error: null });
    await render(<ProtocolDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('protocol-acknowledgment-quiz', hidden)).toBeTruthy());
    expect(screen.queryByTestId('protocol-acknowledgment-sign', hidden)).toBeNull();
    await fireEvent.press(screen.getByTestId('protocol-acknowledgment-quiz-option-5-k1', hidden));
    await fireEvent.press(screen.getByTestId('protocol-acknowledgment-quiz-submit', hidden));
    await waitFor(() => expect(mockSubmitBankQuiz).toHaveBeenCalledWith(70, [{ QuestionId: 5, Keys: ['k1'] }]));
    await waitFor(() => expect(screen.getByTestId('protocol-acknowledgment-score', hidden)).toBeTruthy());
  });

  it('takes a baseline training quiz when the acknowledgment is gated on one', async () => {
    const fetchTraining = jest.fn(async () => ({
      TrainingId: 12,
      Quiz: { MinimumScore: 70, OneQuestionPerPage: false, AttemptLimit: null, Questions: [{ QuestionId: 3, Text: 'Q', Type: 0, Options: [{ OptionId: 30, Text: 'A' }] }] },
    }));

    const submitQuiz = jest.fn(async () => ({ value: { Status: 'Recorded', Recorded: true, Score: 100, Passed: true, QuestionCount: 1, CorrectCount: 1, AttemptNumber: 1, AttemptsLeft: null }, error: null }));
    // SAFETY: a test double: it carries only the fields the code under test reads.
    useTrainingStore.setState({ fetchTraining, submitQuiz } as never);
    useProtocolAcknowledgmentsStore.setState({ acknowledgments: [ack({ Status: 'awaiting_quiz', QuizTrainingId: 12, QuizTrainingName: 'Hazmat quiz' })] });
    await render(<ProtocolDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('protocol-acknowledgment-quiz-option-3-30', hidden)).toBeTruthy());
    await fireEvent.press(screen.getByTestId('protocol-acknowledgment-quiz-option-3-30', hidden));
    await fireEvent.press(screen.getByTestId('protocol-acknowledgment-quiz-submit', hidden));
    await waitFor(() => expect(submitQuiz).toHaveBeenCalledWith(12, [{ QuestionId: 3, OptionIds: [30] }]));
  });
});

describe('CallProtocolSteps', () => {
  const recordStep = jest.fn();
  const startChecklist = jest.fn();

  beforeEach(() => {
    recordStep.mockReset().mockResolvedValue({ outcome: 'queued', id: 'e1' });
    startChecklist.mockReset().mockResolvedValue(checklist({ CallProtocolId: '41', ProtocolId: '2' }));
    useCallProtocolStepsStore.setState({
      checklistsByCall: { '9': [checklist({ Steps: [step('a', 1, ProtocolStepState.Done), step('b', 2)] })] },
      callOrder: ['9'],
      sopLibrary: [
        { ProtocolId: '1', Code: 'MAY', Name: 'Mayday', VersionId: '31' },
        { ProtocolId: '2', Code: 'RIT', Name: 'RIT', VersionId: '32' },
      ],
      queuedSteps: [],
      loading: {},
      errors: {},
      fetchChecklists: jest.fn(async () => undefined),
      fetchSopLibrary: jest.fn(async () => undefined),
      recordStep,
      startChecklist,
    });
  });

  it('ticks steps (a second tap sends one back to pending) and says when the event is queued offline', async () => {
    await render(<CallProtocolSteps callId="9" canEdit />);
    await fireEvent.press(screen.getByTestId('call-step-40-b-set-2', hidden));
    expect(recordStep).toHaveBeenCalledWith({ callId: '9', callProtocolId: '40', stepId: 'b', state: ProtocolStepState.Skipped });
    await fireEvent.press(screen.getByTestId('call-step-40-a-set-1', hidden));
    expect(recordStep).toHaveBeenLastCalledWith({ callId: '9', callProtocolId: '40', stepId: 'a', state: ProtocolStepState.Pending });
    await waitFor(() => expect(useToastStore.getState().toasts.some((toast) => toast.message === 'protocols.steps.queued')).toBe(true));
  });

  it('starts only procedures the call does not have yet', async () => {
    await render(<CallProtocolSteps callId="9" canEdit />);
    await fireEvent.press(screen.getByTestId('call-protocol-steps-start', hidden));
    expect(screen.queryByTestId('call-protocol-steps-picker-option-1', hidden)).toBeNull();
    await fireEvent.press(screen.getByTestId('call-protocol-steps-picker-option-2', hidden));
    await waitFor(() => expect(startChecklist).toHaveBeenCalledWith('9', '2'));
  });

  it('is read only for a member who may not edit the call', async () => {
    await render(<CallProtocolSteps callId="9" canEdit={false} />);
    expect(screen.getByTestId('call-step-40-a-state', hidden)).toBeTruthy();
    expect(screen.queryByTestId('call-step-40-a-set-1', hidden)).toBeNull();
    expect(screen.queryByTestId('call-protocol-steps-start', hidden)).toBeNull();
  });
});

describe('FileList', () => {
  afterEach(() => setFileOpener(null));

  it('downloads the bytes and hands them to the platform opener, or says it failed', async () => {
    const opened = jest.fn(async () => undefined);
    setFileOpener(opened);
    const bytes = new ArrayBuffer(4);
    const download = jest.fn(async () => ({ data: bytes, contentType: 'application/pdf' }));
    await render(<FileList files={[{ id: 'f1', name: 'map.pdf', type: null, size: 10 }]} download={download} testID="files" />);
    await fireEvent.press(screen.getByTestId('files-f1'));
    await waitFor(() => expect(opened).toHaveBeenCalledWith({ data: bytes, fileName: 'map.pdf', contentType: 'application/pdf' }));

    download.mockRejectedValueOnce(new Error('offline'));
    await fireEvent.press(screen.getByTestId('files-f1'));
    await waitFor(() => expect(useToastStore.getState().toasts.some((toast) => toast.message === 'protocols.files.open_failed')).toBe(true));
  });

  it('says files cannot be opened where no opener is registered', async () => {
    await render(<FileList files={[{ id: 'f1', name: 'map.pdf', type: null, size: null }]} download={async () => ({ data: new ArrayBuffer(1), contentType: null })} testID="files" />);
    await act(async () => {
      await fireEvent.press(screen.getByTestId('files-f1'));
    });
    await waitFor(() => expect(useToastStore.getState().toasts.some((toast) => toast.message === 'protocols.files.open_unavailable')).toBe(true));
  });
});
