import '../../calls/__tests__/test-setup';

import { type ProtocolLibraryEntry, useProtocolAcknowledgmentsStore, useProtocolsStore, useTrainingStore } from '@resgrid/data';
import type { CallProtocolsResultData, ProtocolAcknowledgmentResultData, ProtocolQuizView, ProtocolVersionContentData, TrainingQuizData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { AcknowledgmentPanel } from '../components/acknowledgment-panel';
import { QuizForm } from '../components/quiz-form';
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

const entry = (Id: string, Kind: number, extra: Partial<ProtocolLibraryEntry> = {}): ProtocolLibraryEntry => ({
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

const content = (versionId: string): ProtocolVersionContentData => ({
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
  DueOn: null,
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

const bankQuiz = (AttemptId: number, ProtocolVersionId: number, text: string): ProtocolQuizView => ({
  AttemptId,
  ProtocolId: 1,
  ProtocolVersionId,
  ProtocolCode: 'P1',
  ProtocolName: 'P',
  VersionLabel: '3',
  PassMark: 80,
  Questions: [{ QuestionId: 5, Kind: 0, Text: text, ImageUrl: null, Points: 1, Options: [{ Key: 'k1', Text: 'A' }] }],
});

const trainingQuiz = (text: string): TrainingQuizData => ({ MinimumScore: 70, OneQuestionPerPage: false, AttemptLimit: null, Questions: [{ QuestionId: 3, Text: text, Type: 0, Options: [{ OptionId: 30, Text: 'A' }] }] });

const mockAcknowledge = jest.fn();
const mockStartBankQuiz = jest.fn();

beforeEach(() => {
  activateVariant('responder');
  jest.mocked(router.push).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: '1' });
  useToastStore.getState().clearToasts();
  mockAcknowledge.mockReset().mockResolvedValue({ kind: 'answered', data: { Outcome: 'Acknowledged', Accepted: true, CurrentVersionId: null, CurrentContentHash: null, AcknowledgmentId: 7 } });
  mockStartBankQuiz.mockReset();
  useProtocolsStore.setState({
    protocols: [protocol('1'), protocol('2', { Name: 'Hazmat entry', Code: 'HZ' })],
    protocolDetailsById: {},
    libraryById: { '1': entry('1', 1), '2': entry('2', 4) },
    versionContentById: {},
    loading: {},
    errors: {},
    fetchProtocols: jest.fn(async () => undefined),
    fetchProtocol: jest.fn(async () => null),
    fetchVersionContent: jest.fn(async () => null),
    categories: [],
    fetchCategories: jest.fn(async () => undefined),
  });
  useProtocolAcknowledgmentsStore.setState({
    acknowledgments: [],
    loading: {},
    errors: {},
    fetchAcknowledgments: jest.fn(async () => undefined),
    acknowledge: mockAcknowledge,
    held: [],
    startBankQuiz: mockStartBankQuiz,
  });
});

describe('AcknowledgmentPanel quiz loads', () => {
  it('keeps the bank quiz of the current acknowledgment when an earlier load finishes last', async () => {
    const pending = new Map<number, (value: { quiz: ProtocolQuizView | null; error: null }) => void>();
    mockStartBankQuiz.mockImplementation((versionId: number) => new Promise((resolve) => pending.set(versionId, resolve)));

    const view = await render(<AcknowledgmentPanel acknowledgment={ack({ Status: 'awaiting_quiz', BankQuizOwed: true })} contentHash="hash-3" testID="panel" />);
    await view.rerender(<AcknowledgmentPanel acknowledgment={ack({ AcknowledgmentId: 8, ProtocolVersionId: 32, Status: 'awaiting_quiz', BankQuizOwed: true })} contentHash="hash-4" testID="panel" />);
    expect(mockStartBankQuiz.mock.calls.map(([versionId]) => versionId)).toEqual([31, 32]);

    await act(async () => pending.get(32)?.({ quiz: bankQuiz(72, 32, 'Second version question'), error: null }));
    await act(async () => pending.get(31)?.({ quiz: bankQuiz(70, 31, 'First version question'), error: null }));

    expect(screen.getByText('1. Second version question')).toBeTruthy();
    expect(screen.queryByText('1. First version question')).toBeNull();
  });

  it('keeps the training quiz of the current acknowledgment when an earlier load finishes last', async () => {
    const pending = new Map<number, (value: { TrainingId: number; Quiz: TrainingQuizData }) => void>();
    const fetchTraining = jest.fn((trainingId: number) => new Promise((resolve) => pending.set(trainingId, resolve)));
    // SAFETY: a test double: it carries only the action the code under test calls.
    useTrainingStore.setState({ fetchTraining } as never);

    const view = await render(<AcknowledgmentPanel acknowledgment={ack({ Status: 'awaiting_quiz', QuizTrainingId: 12 })} contentHash="hash-3" testID="panel" />);
    await view.rerender(<AcknowledgmentPanel acknowledgment={ack({ AcknowledgmentId: 8, ProtocolVersionId: 32, Status: 'awaiting_quiz', QuizTrainingId: 13 })} contentHash="hash-4" testID="panel" />);
    expect(fetchTraining.mock.calls.map(([trainingId]) => trainingId)).toEqual([12, 13]);

    await act(async () => pending.get(13)?.({ TrainingId: 13, Quiz: trainingQuiz('Second training question') }));
    await act(async () => pending.get(12)?.({ TrainingId: 12, Quiz: trainingQuiz('First training question') }));

    expect(screen.getByText('1. Second training question')).toBeTruthy();
    expect(screen.queryByText('1. First training question')).toBeNull();
  });
});

describe('ProtocolDetailScreen signing', () => {
  it('signs only once the owed version content has loaded, never with the acknowledgment hash alone', async () => {
    useProtocolAcknowledgmentsStore.setState({ acknowledgments: [ack()] });
    await render(<ProtocolDetailScreen />);

    expect(screen.getByTestId('protocol-acknowledgment-content-needed', hidden)).toBeTruthy();
    expect(screen.getByTestId('protocol-acknowledgment-sign', hidden)).toBeDisabled();
    await fireEvent.press(screen.getByTestId('protocol-acknowledgment-sign', hidden));
    expect(mockAcknowledge).not.toHaveBeenCalled();

    await act(async () => useProtocolsStore.setState({ versionContentById: { '31': content('31') } }));
    expect(screen.queryByTestId('protocol-acknowledgment-content-needed', hidden)).toBeNull();
    await fireEvent.press(screen.getByTestId('protocol-acknowledgment-sign', hidden));
    expect(mockAcknowledge).toHaveBeenCalledWith(31, 'hash-3');
  });
});

describe('QuizForm accessibility', () => {
  const questions = [
    {
      id: '1',
      text: 'Which side?',
      multiple: false,
      options: [
        { key: 'x', text: 'Left' },
        { key: 'y', text: 'Right' },
      ],
    },
    { id: '2', text: 'Which tools?', multiple: true, options: [{ key: 'z', text: 'Axe' }] },
  ];

  it('names each single-choice group by its question and reports a picked radio as checked', async () => {
    await render(<QuizForm questions={questions} onSubmit={jest.fn()} testID="quiz" />);
    expect(screen.getByTestId('quiz-question-1').props.accessibilityLabel).toBe('Which side?');
    expect(screen.getByTestId('quiz-question-2').props.accessibilityLabel).toBeUndefined();

    await fireEvent.press(screen.getByTestId('quiz-option-1-y'));
    expect(screen.getByTestId('quiz-option-1-y')).toBeChecked();
    expect(screen.getByTestId('quiz-option-1-x')).not.toBeChecked();

    await fireEvent.press(screen.getByTestId('quiz-option-2-z'));
    expect(screen.getByTestId('quiz-option-2-z')).toBeChecked();
  });
});

describe('ProtocolListScreen filters after a refresh', () => {
  it('drops a picked kind the refreshed library no longer offers, so nothing stays filtered out unseen', async () => {
    await render(<ProtocolListScreen />);
    await fireEvent.press(screen.getByTestId('protocol-kinds-4', hidden));
    expect(screen.queryByTestId('protocol-card-1', hidden)).toBeNull();

    // The refresh leaves one kind, so the kind chips are gone.
    await act(async () => useProtocolsStore.setState({ libraryById: { '1': entry('1', 1), '2': entry('2', 1) } }));
    expect(screen.queryByTestId('protocol-kinds', hidden)).toBeNull();
    expect(screen.getByTestId('protocol-card-1', hidden)).toBeTruthy();
    expect(screen.getByTestId('protocol-card-2', hidden)).toBeTruthy();
  });

  it('drops a picked category once the department no longer has it', async () => {
    useProtocolsStore.setState({
      libraryById: { '1': entry('1', 1, { CategoryId: 5 }), '2': entry('2', 4, { CategoryId: 6 }) },
      categories: [
        { CategoryId: 5, Name: 'Fire', ParentId: null, SortOrder: 1, Kind: null },
        { CategoryId: 6, Name: 'Hazmat', ParentId: null, SortOrder: 2, Kind: null },
      ],
    });
    await render(<ProtocolListScreen />);
    await fireEvent.press(screen.getByText('Hazmat', hidden));
    expect(screen.queryByTestId('protocol-card-1', hidden)).toBeNull();

    await act(async () => useProtocolsStore.setState({ categories: [] }));
    expect(screen.queryByTestId('protocol-categories', hidden)).toBeNull();
    expect(screen.getByTestId('protocol-card-1', hidden)).toBeTruthy();
    expect(screen.getByTestId('protocol-card-2', hidden)).toBeTruthy();
  });
});
