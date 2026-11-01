import { useOperationsStore } from '@resgrid/data';
import type { Deployment, TimeEntry, TimeEntryData, TimeReport, TimeReportIssue } from '@resgrid/models';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defaultScope, localDateKey, operationsErrorKey, reportForScope, scopeKey, type TimeScope, validateEntries } from '../lib/time';

/** Outcome messages of the last time action (`operations.*` keys). */
export type TimeWorkspaceMessage = { tone: 'info' | 'error'; key: string } | null;

export interface TimeWorkspace {
  dateKey: string;
  selectDay: (dateKey: string) => void;
  scope: TimeScope | null;
  selectScope: (scope: TimeScope) => void;
  /** The open report: one picked from the day / approval lists, else the scope's report for the day. */
  report: TimeReport | null;
  openReport: (report: Pick<TimeReport, 'Id' | 'ReportDate'>) => void;
  entries: TimeEntry[];
  setEntries: (entries: TimeEntry[]) => void;
  dirty: boolean;
  issues: TimeReportIssue[];
  busy: boolean;
  message: TimeWorkspaceMessage;
  start: () => Promise<void>;
  save: () => Promise<void>;
  submit: () => Promise<void>;
  sign: (crewBossSigned: boolean, customerSignerName?: string | null) => Promise<void>;
  approve: () => Promise<void>;
}

const copyEntries = (report: TimeReport | null): TimeEntry[] => (report ? report.Entries.map((entry) => ({ ...entry })) : []);

/** The wire shape: the device writes the department-local wall clock; the server converts it. */
const toEntryData = (entry: TimeEntry): TimeEntryData => ({
  Id: entry.Id ?? null,
  SubjectType: entry.SubjectType,
  DeploymentPersonnelId: entry.DeploymentPersonnelId ?? null,
  DeploymentUnitId: entry.DeploymentUnitId ?? null,
  DeploymentEquipmentId: entry.DeploymentEquipmentId ?? null,
  EntryType: entry.EntryType,
  StartLocal: entry.StartLocal,
  EndLocal: entry.EndLocal,
  PaidBreakMinutes: entry.PaidBreakMinutes,
  UnpaidBreakMinutes: entry.UnpaidBreakMinutes,
  CrewSizeSnapshot: entry.CrewSizeSnapshot ?? null,
  CertificationCode: entry.CertificationCode ?? null,
  MileageKm: entry.MileageKm ?? null,
  FuelDeductionLitres: entry.FuelDeductionLitres ?? null,
  AgencySuppliedMeals: entry.AgencySuppliedMeals,
  AgencySuppliedAccommodation: entry.AgencySuppliedAccommodation,
  Notes: entry.Notes ?? null,
  SortOrder: entry.SortOrder,
});

/**
 * View state of a deployment's time section (legacy operations store `scope / report / entries / dirty / issues`; view
 * state lives in features, plan §5.5). Server data comes from `useOperationsStore`: crew time entries save through the
 * outbox (offline-capable, newest save of a report wins); start, submit, sign and approve are online only.
 */
export function useTimeWorkspace(deployment: Deployment | null, reports: TimeReport[], activeUnitId: string | null): TimeWorkspace {
  const [dateKey, setDateKey] = useState(localDateKey);
  const [scope, setScope] = useState<TimeScope | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntriesState] = useState<TimeEntry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<TimeReportIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<TimeWorkspaceMessage>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const deploymentId = deployment?.Id ?? null;

  // Open on the default scope once the deployment (with the server's TimeAccess) is known.
  const scopedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!deployment || scopedFor.current === deployment.Id) return;
    scopedFor.current = deployment.Id;
    setScope(defaultScope(deployment, activeUnitId));
  }, [deployment, activeUnitId]);

  const report = useMemo(() => (selectedId ? (reports.find((candidate) => candidate.Id === selectedId) ?? null) : reportForScope(reports, dateKey, scope)), [selectedId, reports, dateKey, scope]);

  // The editor follows the server copy whenever the person has no unsaved edits.
  useEffect(() => {
    if (!dirtyRef.current) setEntriesState(copyEntries(report));
  }, [report]);

  const navigate = useCallback((apply: () => void) => {
    setDirty(false);
    dirtyRef.current = false;
    setIssues([]);
    setMessage(null);
    apply();
  }, []);

  const selectDay = useCallback(
    (next: string) =>
      navigate(() => {
        setDateKey(next);
        setSelectedId(null);
      }),
    [navigate]
  );
  const selectScope = useCallback(
    (next: TimeScope) =>
      navigate(() => {
        setScope(next);
        setSelectedId(null);
      }),
    [navigate]
  );
  const openReport = useCallback(
    (target: Pick<TimeReport, 'Id' | 'ReportDate'>) =>
      navigate(() => {
        const day = /^(\d{4}-\d{2}-\d{2})/.exec(target.ReportDate)?.[1];
        if (day) setDateKey(day);
        setSelectedId(target.Id);
        // Selecting the same report again still re-reads its entries.
        setEntriesState(copyEntries(reports.find((candidate) => candidate.Id === target.Id) ?? null));
      }),
    [navigate, reports]
  );

  const setEntries = useCallback((next: TimeEntry[]) => {
    setEntriesState(next);
    setDirty(true);
    setIssues([]);
  }, []);

  const fail = useCallback(() => {
    const key = operationsErrorKey(useOperationsStore.getState().actionError) ?? 'retry';
    setMessage({ tone: 'error', key: `operations.errors.${key}` });
  }, []);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }, []);

  const start = useCallback(
    () =>
      run(async () => {
        if (!deploymentId || !scope) return;
        const startedFor = scopeKey(scope);
        const created = await useOperationsStore.getState().openTimeReport({
          DeploymentId: deploymentId,
          ReportDate: dateKey,
          DeploymentUnitId: scope.kind === 'crew' ? scope.unitId : null,
          DeploymentPersonnelId: scope.kind === 'individual' ? scope.personnelId : null,
        });
        if (!created) {
          fail();
          return;
        }
        // The scope can change while the create is in flight; only the report that still matches it opens.
        if (scopeKey(scope) === startedFor) setSelectedId(created.Id);
      }),
    [run, deploymentId, scope, dateKey, fail]
  );

  const save = useCallback(
    () =>
      run(async () => {
        if (!deploymentId || !report) return;
        const local = validateEntries(entries);
        if (local.length > 0) {
          setIssues(local.map((issue) => ({ Code: issue.code, EntryId: String(issue.index) })));
          return;
        }
        const result = await useOperationsStore.getState().saveTimeEntries(deploymentId, { TimeReportId: report.Id, Entries: entries.map(toEntryData) });
        if (result.outcome === 'rejected') {
          setMessage({ tone: 'error', key: 'operations.time.rejected' });
          return;
        }
        setDirty(false);
        dirtyRef.current = false;
        setMessage({ tone: 'info', key: result.outcome === 'sent' ? 'operations.time.saved' : 'operations.time.queued' });
      }),
    [run, deploymentId, report, entries]
  );

  const submit = useCallback(
    () =>
      run(async () => {
        if (!deploymentId || !report || dirtyRef.current) return;
        if (!(await useOperationsStore.getState().submitTimeReport(report.Id, deploymentId))) fail();
      }),
    [run, deploymentId, report, fail]
  );

  const sign = useCallback(
    (crewBossSigned: boolean, customerSignerName?: string | null) =>
      run(async () => {
        if (!deploymentId || !report || (!crewBossSigned && !customerSignerName)) return;
        const ok = await useOperationsStore.getState().signTimeReport({ Id: report.Id, ContractorSigned: crewBossSigned, CustomerSignerName: customerSignerName ?? null }, deploymentId);
        if (!ok) fail();
      }),
    [run, deploymentId, report, fail]
  );

  const approve = useCallback(
    () =>
      run(async () => {
        if (!deploymentId || !report) return;
        if (!(await useOperationsStore.getState().approveTimeReport(report.Id, deploymentId))) fail();
      }),
    [run, deploymentId, report, fail]
  );

  return { dateKey, selectDay, scope, selectScope, report, openReport, entries, setEntries, dirty, issues, busy, message, start, save, submit, sign, approve };
}
