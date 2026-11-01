import '../../calls/__tests__/test-setup';

import { featureFlagsStore, useAuthStore } from '@resgrid/auth';
import { getActiveVariant } from '@resgrid/config';
import { useCalOesMarsStore, useOperationsStore } from '@resgrid/data';
import { type Deployment, DeploymentFinanceMode, type Expense, type TimeEntry, type TimeReport, TimeReportScope, TimeReportStatus, TimeSubjectType } from '@resgrid/models';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { activateVariant } from '../../calls/__tests__/test-utils';
import { ExpensesPanel } from '../components/expenses-panel';
import { resolveOperationsCapabilities } from '../lib/operations-capabilities';
import { applyToCrew, availableScopes, defaultScope, endLocalFor, entryHours, operationsErrorKey, reportForScope, scopeSubjects, sumHours, validateEntries } from '../lib/time';
import { operationsDeployment } from '../routes';
import OperationsDeploymentScreen from '../screens/operations-deployment';
import OperationsListScreen from '../screens/operations-list';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ base64: 'AAA', mimeType: 'image/jpeg' }] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

const entry = (subjectType: number, id: string, extra: Partial<TimeEntry> = {}): TimeEntry => ({
  Id: `e-${id}`,
  SubjectType: subjectType,
  DeploymentPersonnelId: subjectType === TimeSubjectType.Personnel ? id : null,
  DeploymentUnitId: subjectType === TimeSubjectType.Unit ? id : null,
  DeploymentEquipmentId: null,
  EntryType: 0,
  StartLocal: '2026-10-31T08:00',
  EndLocal: '2026-10-31T18:00',
  PaidBreakMinutes: 0,
  UnpaidBreakMinutes: 30,
  AgencySuppliedMeals: false,
  AgencySuppliedAccommodation: false,
  SortOrder: 0,
  ...extra,
});

const deployment = (extra: Partial<Deployment> = {}): Deployment => ({
  Id: 'd1',
  Name: 'Ridge Fire strike team',
  Status: 2,
  FinanceMode: DeploymentFinanceMode.CostRecovery,
  IncidentNumber: 'CA-1',
  Units: [{ Id: 'du1', UnitId: 41, UnitName: 'Engine 41', IsActive: true }],
  Personnel: [
    { Id: 'dp1', UserId: 'u1', Name: 'Pat Boss', DeploymentUnitId: 'du1', IsActive: true },
    { Id: 'dp2', UserId: 'u2', Name: 'Sam Crew', DeploymentUnitId: 'du1', IsActive: true },
  ],
  Equipment: [],
  TimeAccess: { CanManage: false, CanApprove: true, PersonnelId: 'dp1', CrewUnitIds: ['du1'], WritableSubjectIds: ['du1', 'dp1', 'dp2'] },
  ...extra,
});

const report = (extra: Partial<TimeReport> = {}): TimeReport => ({
  Id: 'tr1',
  DeploymentId: 'd1',
  ReportNumber: 3,
  ReportDate: '2026-10-31T00:00:00',
  Scope: TimeReportScope.Crew,
  DeploymentUnitId: 'du1',
  CanAct: true,
  Status: TimeReportStatus.Draft,
  Entries: [entry(TimeSubjectType.Unit, 'du1'), entry(TimeSubjectType.Personnel, 'dp1', { SortOrder: 1 })],
  ...extra,
});

describe('time helpers', () => {
  it('computes hours across midnight and flags overlaps', () => {
    expect(endLocalFor('2026-10-31T20:00', '06:00')).toBe('2026-11-01T06:00');
    expect(entryHours(entry(TimeSubjectType.Unit, 'du1'))).toBe(9.5);
    expect(sumHours([entry(TimeSubjectType.Unit, 'du1'), entry(TimeSubjectType.Personnel, 'dp1')])).toBe(19);
    const overlapping = [entry(TimeSubjectType.Personnel, 'dp1'), entry(TimeSubjectType.Personnel, 'dp1', { StartLocal: '2026-10-31T12:00', EndLocal: '2026-10-31T20:00' })];
    expect(validateEntries(overlapping).map((issue) => issue.code)).toEqual(['overlap']);
  });

  it('offers the scopes TimeAccess grants and opens the crew report the person is seated on', () => {
    const d = deployment();
    expect(availableScopes(d)).toEqual([
      { kind: 'crew', unitId: 'du1' },
      { kind: 'individual', personnelId: 'dp1' },
    ]);
    expect(defaultScope(d, null)).toEqual({ kind: 'crew', unitId: 'du1' });
    expect(scopeSubjects(d, { kind: 'crew', unitId: 'du1' }).map((subject) => subject.id)).toEqual(['du1', 'dp1', 'dp2']);
    expect(reportForScope([report()], '2026-10-31', { kind: 'crew', unitId: 'du1' })?.Id).toBe('tr1');
  });

  it('applies one row to the crew on the same entry type', () => {
    const rows = [entry(TimeSubjectType.Unit, 'du1', { StartLocal: '2026-10-31T07:00' }), entry(TimeSubjectType.Personnel, 'dp2')];
    expect(applyToCrew(rows, 0, () => true)[1].StartLocal).toBe('2026-10-31T07:00');
  });

  it('maps data errors to operations error keys', () => {
    expect(operationsErrorKey({ code: 'forbidden', messageKey: '' })).toBe('denied');
    expect(operationsErrorKey({ code: 'rejected', messageKey: '', problemType: 'protected_data_required' })).toBe('locked');
    expect(operationsErrorKey({ code: 'network', messageKey: '' })).toBe('retry');
    expect(() => operationsDeployment('a/b')).toThrow();
  });

  it('derives what each app may do from its capabilities (no per-app fork)', () => {
    const caps = (id: Parameters<typeof activateVariant>[0]) => {
      activateVariant(id);
      return resolveOperationsCapabilities(getActiveVariant().capabilities);
    };
    expect(caps('responder')).toEqual({ editTime: true, recordUsage: true, recordExpenses: true, approveTime: true, draftF42: true, usesActiveUnit: false });
    expect(caps('unit')).toEqual({ editTime: true, recordUsage: true, recordExpenses: true, approveTime: false, draftF42: true, usesActiveUnit: true });
    expect(caps('ic')).toEqual({ editTime: true, recordUsage: false, recordExpenses: false, approveTime: true, draftF42: true, usesActiveUnit: false });
    expect(caps('dispatch')).toEqual({ editTime: false, recordUsage: false, recordExpenses: false, approveTime: false, draftF42: false, usesActiveUnit: false });
  });
});

describe('operations screens', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 31, 9, 0, 0));
    activateVariant('responder');
    featureFlagsStore.setState({ flags: { 'Operations.Deployments': { enabled: true } }, isLoaded: true });
    useAuthStore.setState({ userId: 'u1' });
    (router.push as jest.Mock).mockClear();
    useOperationsStore.setState({
      access: { Enabled: true, CanManage: false, CanApproveTimeReports: true, ContractorBilling: false },
      costAccess: { Enabled: true, CanViewInternalCosts: false, CanRecordUsage: true },
      deployments: [deployment()],
      deploymentsById: { d1: deployment() },
      timeReportsByDeployment: { d1: [report()] },
      expensesByDeployment: { d1: [] },
      usageByDeployment: { d1: [] },
      loading: {},
      errors: {},
      actionError: null,
      loadAccess: jest.fn(async () => undefined),
      loadDeployments: jest.fn(async () => undefined),
      loadDeployment: jest.fn(async () => undefined),
      loadTimeReports: jest.fn(async () => undefined),
      loadExpenses: jest.fn(async () => undefined),
      loadUsage: jest.fn(async () => undefined),
      saveTimeEntries: jest.fn(async () => ({ outcome: 'queued' as const, id: 'w1' })),
      submitTimeReport: jest.fn(async () => true),
      approveTimeReport: jest.fn(async () => true),
      signTimeReport: jest.fn(async () => false),
      addExpense: jest.fn(async () => ({ outcome: 'sent' as const, id: 'x1' })),
      addUsage: jest.fn(async () => true),
      openTimeReport: jest.fn(async () => null),
    });
    useCalOesMarsStore.setState({
      access: null,
      queue: [{ Id: 'w9', DeploymentId: 'd1', RecordType: 1, LocalState: 1, ErrorCount: 0, WarningCount: 1, IsMine: true }],
      validation: null,
      loadAccess: jest.fn(async () => {
        useCalOesMarsStore.setState({ access: { Enabled: true, CanView: true, CanManage: true, CanSubmit: false } });
        return useCalOesMarsStore.getState().access;
      }),
      loadQueue: jest.fn(async () => useCalOesMarsStore.getState().queue),
      draftF42: jest.fn(async () => true),
      validate: jest.fn(async () => true),
    });
  });

  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it('lists deployments, switches to all and opens one', async () => {
    render(<OperationsListScreen />);
    await waitFor(() => expect(useOperationsStore.getState().loadDeployments).toHaveBeenCalledWith(false));
    fireEvent.press(screen.getByTestId('operations-filter-all'));
    await waitFor(() => expect(useOperationsStore.getState().loadDeployments).toHaveBeenLastCalledWith(true));
    fireEvent.press(screen.getByTestId('operations-deployment-d1'));
    expect(router.push).toHaveBeenCalledWith('/operations/d1');
  });

  it('shows the disabled state when the department has deployments off', () => {
    featureFlagsStore.setState({ flags: { 'Operations.Deployments': { enabled: false } }, isLoaded: true });
    render(<OperationsListScreen />);
    expect(screen.getByTestId('operations-disabled')).toBeTruthy();
  });

  it('opens the crew report for the day, edits it and saves through the outbox', async () => {
    render(<OperationsDeploymentScreen deploymentId="d1" />);
    await waitFor(() => expect(screen.getByTestId('operations-time-report')).toBeTruthy());
    expect(screen.getByTestId('operations-total-hours')).toHaveTextContent('operations.time.total:19');
    expect(screen.getByTestId('operations-save-entries')).toBeDisabled();
    fireEvent.changeText(screen.getByTestId('operations-entry-break-1'), '60');
    fireEvent.press(screen.getByTestId('operations-save-entries'));
    await waitFor(() => expect(useOperationsStore.getState().saveTimeEntries).toHaveBeenCalledWith('d1', expect.objectContaining({ TimeReportId: 'tr1' })));
    const saved = jest.mocked(useOperationsStore.getState().saveTimeEntries).mock.calls[0][1];
    expect(saved.Entries?.[1]).toEqual(expect.objectContaining({ UnpaidBreakMinutes: 60, StartLocal: '2026-10-31T08:00' }));
    expect(saved.Entries?.[1]).not.toHaveProperty('StartTime');
    expect(screen.getByTestId('operations-message')).toHaveTextContent('operations.time.queued');
  });

  it('surfaces a refused legal step as a coded error', async () => {
    render(<OperationsDeploymentScreen deploymentId="d1" />);
    await waitFor(() => expect(screen.getByTestId('operations-sign-crew-boss')).toBeTruthy());
    useOperationsStore.setState({ actionError: { code: 'forbidden', messageKey: 'errors.data.forbidden' } });
    fireEvent.press(screen.getByTestId('operations-sign-crew-boss'));
    await waitFor(() => expect(screen.getByTestId('operations-message')).toHaveTextContent('operations.errors.denied'));
  });

  it('gives an approver the submitted queue and approves the opened report', async () => {
    useOperationsStore.setState({ timeReportsByDeployment: { d1: [report({ Status: TimeReportStatus.Submitted, ReportDate: '2026-10-30T00:00:00' })] } });
    render(<OperationsDeploymentScreen deploymentId="d1" />);
    await waitFor(() => expect(screen.getByTestId('operations-awaiting-tr1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('operations-awaiting-tr1'));
    await waitFor(() => expect(screen.getByTestId('operations-approve-report')).toBeTruthy());
    fireEvent.press(screen.getByTestId('operations-approve-report'));
    await waitFor(() => expect(useOperationsStore.getState().approveTimeReport).toHaveBeenCalledWith('tr1', 'd1'));
  });

  it('shows usage, expenses and the F-42 sections only where the app and the server allow them', async () => {
    render(<OperationsDeploymentScreen deploymentId="d1" />);
    await waitFor(() => expect(screen.getByTestId('operations-section-mars')).toBeTruthy());
    expect(screen.getByTestId('operations-section-usage')).toBeTruthy();
    expect(screen.getByTestId('operations-section-expenses')).toBeTruthy();
    fireEvent.press(screen.getByTestId('operations-section-mars'));
    fireEvent.press(screen.getByTestId('operations-mars-draft'));
    expect(useCalOesMarsStore.getState().draftF42).toHaveBeenCalledWith('d1');
    fireEvent.press(screen.getByTestId('operations-section-usage'));
    fireEvent.changeText(screen.getByTestId('operations-usage-engine'), '4.5');
    fireEvent.press(screen.getByTestId('operations-usage-add'));
    await waitFor(() => expect(useOperationsStore.getState().addUsage).toHaveBeenCalledWith(expect.objectContaining({ DeploymentId: 'd1', UnitId: 41, EngineHours: 4.5 })));
  });

  it('is read-only in Dispatch: no start, no usage, no F-42', async () => {
    activateVariant('dispatch');
    useOperationsStore.setState({ timeReportsByDeployment: { d1: [] } });
    render(<OperationsDeploymentScreen deploymentId="d1" />);
    await waitFor(() => expect(screen.getByTestId('operations-no-report')).toBeTruthy());
    expect(screen.queryByTestId('operations-start-report')).toBeNull();
    expect(screen.queryByTestId('operations-section-usage')).toBeNull();
    expect(screen.queryByTestId('operations-section-mars')).toBeNull();
  });
});

describe('ExpensesPanel', () => {
  const expense = (Id: string, AddedByUserId: string): Expense => ({ Id, DeploymentId: 'd1', ExpenseDate: '2026-10-31', ExpenseType: 4, Amount: 42.5, PreApproved: false, Billable: false, AddedByUserId });

  it('validates the amount, attaches a receipt and reports a queued save', async () => {
    const onAdd = jest.fn(async () => 'queued' as const);
    render(<ExpensesPanel dateKey="2026-10-31" currency="USD" expenses={[]} reportId="tr1" userId="u1" canManage={false} canAdd busy={false} onAdd={onAdd} onRemove={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId('operations-expense-amount'), 'abc');
    fireEvent.press(screen.getByTestId('operations-expense-save'));
    await waitFor(() => expect(screen.getByTestId('operations-expense-message')).toHaveTextContent('operations.expenses.amountInvalid'));
    fireEvent.press(screen.getByTestId('operations-expense-camera'));
    await waitFor(() => expect(screen.getByText('operations.expenses.receiptAttached')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('operations-expense-amount'), '12,50');
    fireEvent.press(screen.getByTestId('operations-expense-save'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ Amount: 12.5, ReceiptData: 'AAA', TimeReportId: 'tr1', Currency: 'USD' })));
    expect(screen.getByTestId('operations-expense-message')).toHaveTextContent('operations.expenses.queued');
  });

  it('lets a member remove only their own expenses, after confirming', async () => {
    const onRemove = jest.fn(async () => true);
    render(<ExpensesPanel dateKey="2026-10-31" expenses={[expense('x1', 'u1'), expense('x2', 'u2')]} reportId={null} userId="u1" canManage={false} canAdd={false} busy={false} onAdd={jest.fn()} onRemove={onRemove} />);
    expect(screen.queryByTestId('operations-expense-remove-x2')).toBeNull();
    fireEvent.press(screen.getByTestId('operations-expense-remove-x1'));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('operations-expense-confirm-remove-x1'));
    expect(onRemove).toHaveBeenCalledWith('x1');
  });
});
