import '../../calls/__tests__/test-setup';

import { featureFlagsStore, useAuthStore } from '@resgrid/auth';
import { useChecklistsStore } from '@resgrid/data';
import { StatusProvider } from '@resgrid/features/status';
import type { ChecklistDefinition, ChecklistDuePage, ChecklistForm, ChecklistItem, ChecklistRun } from '@resgrid/models';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { DueChecksCard } from '../components/due-checks-card';
import { applyAnswer, checklistErrorKey, checklistFailed, missingAnswers, visibleChecklistItems } from '../lib/checklist-form';
import { registerChecklistRunWriter, resetChecklistRunWriterForTests } from '../runtime';
import ChecklistsScreen from '../screens/checklists';

const mockFetchDue = jest.fn();
const mockPreview = jest.fn();
jest.mock('../lib/checklists-api', () => ({
  fetchDueChecklists: (page: number, unitId?: string | null) => mockFetchDue(page, unitId),
  fetchChecklistHistory: jest.fn(async () => ({ rows: [{ Id: 'h1', TargetName: 'Engine 41', UpdatedOn: '2026-10-30T10:00:00Z' }], hasMore: false })),
  previewChecklistOccurrence: (id: string) => mockPreview(id),
  fetchChecklistEvidence: jest.fn(async () => 'data:image/png;base64,AAA'),
  fetchChecklistCalendar: jest.fn(async () => []),
}));

const item = (Id: string, Type: number, extra: Partial<ChecklistItem> = {}): ChecklistItem => ({
  Id,
  Name: `Item ${Id}`,
  Type,
  Required: false,
  Critical: false,
  AllowNotApplicable: false,
  RequireNoteOnFail: false,
  RequirePhotoOnFail: false,
  Weight: 1,
  PassingValue: 'true',
  Options: [],
  ...extra,
});

const form: ChecklistForm = {
  Name: 'Daily rig check',
  TargetType: 1,
  Category: 0,
  PassThreshold: 80,
  RequireLocation: false,
  RequiresIndependentWitness: false,
  Sections: [
    {
      Id: 's1',
      Name: 'Exterior',
      Items: [item('lights', 0, { Required: true, RequireNoteOnFail: true }), item('detail', 5, { VisibleWhen: { ItemId: 'lights', EqualsValue: 'fail' } }), item('tires', 1, { AllowNotApplicable: true })],
    },
  ],
};

const run = (extra: Partial<ChecklistRun> = {}): ChecklistRun => ({
  Id: 'run1',
  OccurrenceId: 'occ1',
  DefinitionId: 'def1',
  VersionId: 'v1',
  VersionNumber: 2,
  Revision: 0,
  State: 0,
  IsProtected: false,
  IsPreview: true,
  CanEdit: true,
  CreatedBy: 'u1',
  UpdatedOn: '2026-10-31T08:00:00Z',
  Target: { Type: 1, Id: '41', Name: 'Engine 41' },
  Form: form,
  Input: { Revision: 0, Answers: [] },
  Files: [],
  ...extra,
});

const definition: ChecklistDefinition = {
  Id: 'def2',
  Revision: 1,
  VersionId: 'v9',
  VersionNumber: 1,
  Retired: false,
  IsProtected: false,
  UpdatedOn: '',
  Form: form,
  PublishedForm: form,
  Targets: [{ Type: 1, Id: '41', Name: 'Engine 41' }],
};

const duePage = (count = 1): ChecklistDuePage => ({
  Occurrences: Array.from({ length: count }, (_, index) => ({
    Id: `occ${index + 1}`,
    CompletionId: `c${index + 1}`,
    DefinitionId: 'def1',
    VersionId: 'v1',
    Name: 'Daily rig check',
    Target: { Type: 1, Id: '41', Name: 'Engine 41' },
    State: 0,
    Revision: 0,
    UpdatedOn: '',
    PeriodStartUtc: '2026-10-31T07:00:00',
    WindowEndUtc: '2026-10-31T19:00:00',
    CanStart: true,
  })),
  Definitions: [definition],
  HasMoreOccurrences: false,
  HasMoreDefinitions: false,
});

describe('checklist form', () => {
  it('shows a conditional item only on its branch and drops hidden answers', () => {
    expect(visibleChecklistItems(form, []).map((entry) => entry.Id)).toEqual(['lights', 'tires']);
    const failed = applyAnswer(form, [], 'lights', { Status: 1, Value: 'fail' });
    expect(visibleChecklistItems(form, failed).map((entry) => entry.Id)).toEqual(['lights', 'detail', 'tires']);
    const withDetail = applyAnswer(form, failed, 'detail', { Status: 1, Value: 'cracked lens' });
    expect(applyAnswer(form, withDetail, 'lights', { Status: 1, Value: 'pass' }).map((answer) => answer.ItemId)).toEqual(['lights']);
  });

  it('requires answers, a reason for N/A and a note on a failure that needs one', () => {
    expect(missingAnswers(form, { Revision: 0, Answers: [] }).map((entry) => entry.Id)).toEqual(['lights']);
    expect(missingAnswers(form, { Revision: 0, Answers: [{ ItemId: 'lights', Status: 1, Value: 'fail' }] }).map((entry) => entry.Id)).toEqual(['lights']);
    expect(
      missingAnswers(form, {
        Revision: 0,
        Answers: [
          { ItemId: 'lights', Status: 1, Value: 'pass' },
          { ItemId: 'tires', Status: 2 },
        ],
      }).map((entry) => entry.Id)
    ).toEqual(['tires']);
    expect(checklistFailed(item('n', 3, { Minimum: 1, Maximum: 5 }), { ItemId: 'n', Status: 1, Value: '9' })).toBe(true);
    expect(checklistErrorKey({ code: 'forbidden', messageKey: '', problemType: 'step_up_required' })).toBe('locked');
    expect(checklistErrorKey({ code: 'network', messageKey: '' })).toBe('offline');
  });
});

describe('checklists screen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    activateVariant('responder');
    featureFlagsStore.setState({ flags: { 'Checklists.System': { enabled: true } }, isLoaded: true });
    useAuthStore.setState({ userId: 'u1' });
    (router.push as jest.Mock).mockClear();
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    mockFetchDue.mockReset().mockResolvedValue(duePage());
    mockPreview.mockReset().mockResolvedValue(run());
    resetChecklistRunWriterForTests();
    useChecklistsStore.setState({
      access: { DepartmentId: 1, UserId: 'u1', Enabled: true, CanManage: false, IsProtected: false },
      runsById: {},
      actionError: null,
      fetchAccess: jest.fn(async () => undefined),
      fetchRun: jest.fn(async () => run({ Id: 'h1', State: 1, CreatedBy: 'u2', SubmissionHash: 'hash', CanEdit: false })),
      attestRun: jest.fn(async () => run({ Id: 'h1', State: 2, CanEdit: false })),
    });
  });

  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it('lists due checks for the member and refetches on a realtime ping', async () => {
    render(<ChecklistsScreen />);
    await waitFor(() => expect(screen.getByTestId('checklist-due-occ1')).toBeTruthy());
    expect(mockFetchDue).toHaveBeenCalledWith(0, null);
    act(() => emitRealtimeEvent('checklistUpdated', { id: 'occ1' } as never));
    await waitFor(() => expect(mockFetchDue).toHaveBeenCalledTimes(2));
  });

  it('checks the active unit in Unit, and the member everywhere else', async () => {
    activateVariant('unit');
    const unit = render(
      <StatusProvider activeUnitId="41">
        <ChecklistsScreen />
      </StatusProvider>
    );
    await waitFor(() => expect(mockFetchDue).toHaveBeenCalledWith(0, '41'));
    unit.unmount();
    mockFetchDue.mockClear();
    activateVariant('responder');
    render(
      <StatusProvider activeUnitId="41">
        <ChecklistsScreen />
      </StatusProvider>
    );
    await waitFor(() => expect(mockFetchDue).toHaveBeenCalledWith(0, null));
  });

  it('opens a due check, answers item by item and keeps Save disabled until a writer is registered', async () => {
    render(<ChecklistsScreen />);
    await waitFor(() => expect(screen.getByTestId('checklist-open-occ1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('checklist-open-occ1'));
    await waitFor(() => expect(screen.getByTestId('checklist-item-lights', hidden)).toBeTruthy());
    expect(mockPreview).toHaveBeenCalledWith('occ1');
    expect(screen.getByTestId('checklist-save-unavailable', hidden)).toBeTruthy();
    expect(screen.getByTestId('checklist-submit', hidden)).toBeDisabled();
    fireEvent.press(screen.getByTestId('checklist-choice-fail', hidden));
    fireEvent.press(screen.getByTestId('checklist-next', hidden));
    expect(screen.getByTestId('checklist-item-detail', hidden)).toBeTruthy();
  });

  it('submits through the registered writer after validating required answers', async () => {
    const save = jest.fn(async () => ({ outcome: 'sent' as const, run: run({ State: 2, CanEdit: false, Score: 100 }) }));
    registerChecklistRunWriter({ save });
    render(<ChecklistsScreen />);
    await waitFor(() => expect(screen.getByTestId('checklist-open-occ1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('checklist-open-occ1'));
    await waitFor(() => expect(screen.getByTestId('checklist-submit', hidden)).toBeTruthy());
    fireEvent.press(screen.getByTestId('checklist-submit', hidden));
    await waitFor(() => expect(screen.getByTestId('checklist-run-error', hidden)).toHaveTextContent('checklists.errors.validation'));
    expect(save).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('checklist-choice-pass', hidden));
    fireEvent.press(screen.getByTestId('checklist-submit', hidden));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ submit: true, input: expect.objectContaining({ Answers: [{ ItemId: 'lights', Status: 1, Value: 'pass' }] }) })));
    await waitFor(() => expect(screen.getByTestId('checklist-run-state', hidden)).toHaveTextContent(/checklists.labels.Submitted/));
  });

  it('starts an on-demand form locally and lets a different member witness a run from history', async () => {
    render(<ChecklistsScreen />);
    await waitFor(() => expect(screen.getByTestId('checklist-start-def2-41')).toBeTruthy());
    fireEvent.press(screen.getByTestId('checklist-start-def2-41'));
    await waitFor(() => expect(screen.getByTestId('checklist-item-lights', hidden)).toBeTruthy());
    fireEvent.press(screen.getByTestId('checklist-run-close', hidden));

    fireEvent.press(screen.getByTestId('checklists-history-toggle'));
    await waitFor(() => expect(screen.getByTestId('checklist-history-h1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('checklist-history-h1'));
    await waitFor(() => expect(screen.getByTestId('checklist-witness', hidden)).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('checklist-attestation', hidden), 'Verified on scene');
    fireEvent.press(screen.getByTestId('checklist-attest', hidden));
    await waitFor(() => expect(useChecklistsStore.getState().attestRun).toHaveBeenCalledWith({ Id: 'h1', SubmissionHash: 'hash', Attestation: 'Verified on scene' }));
  });

  it('opens the occurrence named in the route', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ occurrenceId: 'occ7' });
    render(<ChecklistsScreen />);
    await waitFor(() => expect(mockPreview).toHaveBeenCalledWith('occ7'));
  });

  it('shows the unavailable state when the department has checklists off', () => {
    featureFlagsStore.setState({ flags: { 'Checklists.System': { enabled: false } }, isLoaded: true });
    render(<ChecklistsScreen />);
    expect(screen.getByTestId('checklists-disabled')).toBeTruthy();
  });
});

describe('DueChecksCard', () => {
  beforeEach(() => {
    activateVariant('responder');
    featureFlagsStore.setState({ flags: { 'Checklists.System': { enabled: true } }, isLoaded: true });
    (router.push as jest.Mock).mockClear();
    mockFetchDue.mockReset();
  });

  it('shows the due count (capped at a page) and opens the checklists screen', async () => {
    mockFetchDue.mockResolvedValue(duePage(50));
    render(<DueChecksCard />);
    await waitFor(() => expect(screen.getByTestId('home-due-checks')).toHaveTextContent('checklists.labels.DueChecks (50+)'));
    fireEvent.press(screen.getByTestId('home-due-checks'));
    expect(router.push).toHaveBeenCalledWith('/checklists');
  });

  it('renders nothing when checklists are off', () => {
    featureFlagsStore.setState({ flags: {}, isLoaded: true });
    render(<DueChecksCard />);
    expect(screen.queryByTestId('home-due-checks')).toBeNull();
    expect(mockFetchDue).not.toHaveBeenCalled();
  });
});
