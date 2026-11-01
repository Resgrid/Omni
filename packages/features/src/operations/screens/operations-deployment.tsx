import { FeatureFlagKeys, useAuthStore, useFeatureFlagStatus } from '@resgrid/auth';
import { useActiveVariant } from '@resgrid/config';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { selectMarsItemsForDeployment, useCalOesMarsStore, useOperationsStore } from '@resgrid/data';
import { useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { DeploymentFinanceMode, type Expense, type ResourceUsage, type TimeReport, TimeReportStatus } from '@resgrid/models';
import { DateTimeField, Loading, Pressable, ScreenHeader, Text, useFormFactor, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BriefcaseBusiness, ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { type ExpenseAddOutcome, ExpensesPanel } from '../components/expenses-panel';
import { MarsPanel } from '../components/mars-panel';
import { OperationsFrame, Segments } from '../components/operations-layout';
import { AwaitingApproval, DayReports, ScopePicker, useScopeLabel } from '../components/scope-picker';
import { TimeReportEditor } from '../components/time-report-editor';
import { UsageForm } from '../components/usage-form';
import { useTimeWorkspace } from '../hooks/use-time-workspace';
import { type OperationsCapabilities, resolveOperationsCapabilities } from '../lib/operations-capabilities';
import { availableScopes, canWriteSubject, coveringReport, operationsErrorKey, reportScope, reportsOnDate, scopeKey, scopeName, scopeSubjects, shiftDateKey, subjectNames, type TimeScope } from '../lib/time';

type Section = 'time' | 'expenses' | 'usage' | 'mars';

export interface OperationsDeploymentScreenProps {
  /** Defaults to the `id` route param. */
  deploymentId?: string;
  /** Overrides the capability-derived defaults (see `resolveOperationsCapabilities`). */
  capabilities?: Partial<OperationsCapabilities>;
  showHeader?: boolean;
}

const EMPTY_REPORTS: TimeReport[] = [];
const EMPTY_EXPENSES: Expense[] = [];
const EMPTY_USAGE: ResourceUsage[] = [];
const firstParam = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * One deployment (IC baseline, identical in R/U/D): the crew or individual time report for a chosen day, expenses,
 * resource usage readings and the MARS F-42. What the person may open and write comes from the server's TimeAccess
 * (their roster row, the units they crew) and this app's capabilities; approvers get the submitted queue. Landscape
 * boards and desktop windows put the report pickers beside the open section.
 */
export default function OperationsDeploymentScreen({ deploymentId: idProp, capabilities: overrides, showHeader = true }: OperationsDeploymentScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = firstParam(params.id);
  const id = idProp ?? (routeId && isSafeRouteId(routeId) ? routeId : null);
  const flagStatus = useFeatureFlagStatus(FeatureFlagKeys.Deployments);

  if (flagStatus === 'disabled') return <ZeroState icon={BriefcaseBusiness} heading={t('operations.disabled')} testID="operations-disabled" />;
  if (!id) return <ZeroState icon={BriefcaseBusiness} isError heading={t('operations.errors.denied')} testID="operations-invalid" />;
  if (flagStatus === 'unknown') return <Loading />;
  return <DeploymentWorkspace id={id} overrides={overrides} showHeader={showHeader} />;
}

function DeploymentWorkspace({ id, overrides, showHeader }: { id: string; overrides?: Partial<OperationsCapabilities>; showHeader: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPhone, isLandscapeBoard, isDesktop } = useFormFactor();
  const variant = useActiveVariant();
  const caps = useMemo(() => ({ ...resolveOperationsCapabilities(variant.capabilities), ...overrides }), [variant, overrides]);
  const { activeUnitId: shellUnitId } = useStatusContext();
  const activeUnitId = caps.usesActiveUnit ? shellUnitId : null;
  const userId = useAuthStore((state) => state.userId);
  const scopeLabel = useScopeLabel();

  const access = useOperationsStore((state) => state.access);
  const costAccess = useOperationsStore((state) => state.costAccess);
  const deployment = useOperationsStore((state) => state.deploymentsById[id] ?? null);
  const reports = useOperationsStore((state) => state.timeReportsByDeployment[id] ?? EMPTY_REPORTS);
  const expenses = useOperationsStore((state) => state.expensesByDeployment[id] ?? EMPTY_EXPENSES);
  const usage = useOperationsStore((state) => state.usageByDeployment[id] ?? EMPTY_USAGE);
  const isLoading = useOperationsStore((state) => state.loading.deployment === true);
  const loadError = useOperationsStore((state) => state.errors.deployment ?? null);
  const marsAccess = useCalOesMarsStore((state) => state.access);
  const marsQueue = useCalOesMarsStore((state) => state.queue);
  const marsItems = useMemo(() => selectMarsItemsForDeployment({ queue: marsQueue }, id), [marsQueue, id]);
  const marsValidation = useCalOesMarsStore((state) => state.validation);
  const marsBusy = useCalOesMarsStore((state) => state.busy);
  const [section, setSection] = useState<Section>('time');
  const [panelBusy, setPanelBusy] = useState(false);

  const workspace = useTimeWorkspace(deployment, reports, activeUnitId);
  const { dateKey, scope, report } = workspace;

  useEffect(() => {
    let active = true;
    void (async () => {
      const store = useOperationsStore.getState();
      if (!store.access) await store.loadAccess();
      if (!active || !useOperationsStore.getState().access?.Enabled) return;
      await Promise.all([useOperationsStore.getState().loadDeployment(id), useOperationsStore.getState().loadTimeReports(id)]);
      if (!active) return;
      if (caps.recordExpenses) void useOperationsStore.getState().loadExpenses(id);
      if (caps.recordUsage && useOperationsStore.getState().costAccess?.Enabled) void useOperationsStore.getState().loadUsage(id);
      // MARS is an optional add-on: a failure there must not hide the deployment.
      if (caps.draftF42 && (await useCalOesMarsStore.getState().loadAccess())?.Enabled && active) void useCalOesMarsStore.getState().loadQueue();
    })();
    return () => {
      active = false;
    };
  }, [id, caps.recordExpenses, caps.recordUsage, caps.draftF42]);

  const timeAccess = deployment?.TimeAccess ?? null;
  const scopes = useMemo(() => (deployment ? availableScopes(deployment) : []), [deployment]);
  const names = useMemo(() => (deployment ? subjectNames(deployment) : {}), [deployment]);
  // The picker offers the subjects of the open report's own scope (a manager may open any report on the day).
  const openScope: TimeScope | null = report ? reportScope(report) : scope;
  const subjects = useMemo(() => (deployment ? scopeSubjects(deployment, openScope) : []), [deployment, openScope]);
  const dayReports = useMemo(() => reportsOnDate(reports, dateKey), [reports, dateKey]);
  const awaiting = useMemo(() => reports.filter((candidate) => candidate.Status === TimeReportStatus.Submitted).sort((a, b) => a.ReportDate.localeCompare(b.ReportDate)), [reports]);
  const canApprove = caps.approveTime && !!timeAccess?.CanApprove;
  const supervises = !!timeAccess?.CanManage || canApprove;
  const covered = useMemo(() => {
    if (report || !scope) return null;
    const subject = scope.kind === 'crew' ? scope.unitId : scope.kind === 'individual' ? scope.personnelId : null;
    return subject ? coveringReport(reports, dateKey, subject) : null;
  }, [report, scope, reports, dateKey]);
  const canCreate = caps.editTime && !!scope && (scope.kind !== 'deployment' || !!timeAccess?.CanManage);
  const writable = useCallback((subjectId: string) => caps.editTime && !!deployment && canWriteSubject(deployment, subjectId), [caps.editTime, deployment]);
  const showUsage = caps.recordUsage && !!costAccess?.Enabled && !!costAccess.CanRecordUsage;
  const showExpenses = caps.recordExpenses && (!!timeAccess?.CanManage || (timeAccess?.WritableSubjectIds.length ?? 0) > 0);
  const showMars = caps.draftF42 && !!marsAccess?.Enabled && deployment?.FinanceMode === DeploymentFinanceMode.CostRecovery;
  const canDraftF42 = showMars && (!!marsAccess?.CanManage || (timeAccess?.WritableSubjectIds.length ?? 0) > 0);
  const usageUnits = useMemo(() => {
    if (!deployment) return [];
    const units = deployment.Units.filter((unit) => unit.IsActive);
    if (timeAccess?.CanManage) return units;
    const crewed = units.filter((unit) => timeAccess?.CrewUnitIds.includes(unit.Id));
    const mine = activeUnitId ? crewed.filter((unit) => String(unit.UnitId) === activeUnitId) : [];
    return mine.length > 0 ? mine : crewed;
  }, [deployment, timeAccess, activeUnitId]);

  const sections = useMemo(
    () =>
      [
        { value: 'time' as const, label: t('operations.time.title'), testID: 'operations-section-time', show: true },
        { value: 'expenses' as const, label: t('operations.expenses.title'), testID: 'operations-section-expenses', show: showExpenses },
        { value: 'usage' as const, label: t('operations.usage.title'), testID: 'operations-section-usage', show: showUsage },
        { value: 'mars' as const, label: t('operations.mars.title'), testID: 'operations-section-mars', show: showMars },
      ].filter((option) => option.show),
    [t, showExpenses, showUsage, showMars]
  );
  const activeSection: Section = sections.some((option) => option.value === section) ? section : 'time';

  const addExpense = useCallback(
    async (input: Parameters<React.ComponentProps<typeof ExpensesPanel>['onAdd']>[0]): Promise<ExpenseAddOutcome> => {
      setPanelBusy(true);
      try {
        return (await useOperationsStore.getState().addExpense(id, { ...input, DeploymentId: id })).outcome;
      } finally {
        setPanelBusy(false);
      }
    },
    [id]
  );
  const removeExpense = useCallback(async (expenseId: string) => useOperationsStore.getState().removeExpense(expenseId, id), [id]);
  const addUsage = useCallback(
    async (input: Parameters<React.ComponentProps<typeof UsageForm>['onAdd']>[0]) => {
      setPanelBusy(true);
      try {
        return await useOperationsStore.getState().addUsage({ ...input, DeploymentId: id, CallId: deployment?.CallId ?? null });
      } finally {
        setPanelBusy(false);
      }
    },
    [id, deployment?.CallId]
  );

  const header = showHeader ? <ScreenHeader title={deployment?.Name ?? t('operations.title')} onBack={() => router.back()} testID="operations-deployment-header" /> : null;
  const loadErrorKey = operationsErrorKey(loadError);
  const busy = workspace.busy || panelBusy || marsBusy;

  if (!deployment) {
    return (
      <View style={styles.screen} className="bg-background-0" testID="operations-deployment-screen">
        {header}
        {access && !access.Enabled ? (
          <ZeroState icon={BriefcaseBusiness} heading={t('operations.disabled')} testID="operations-access-disabled" />
        ) : loadErrorKey && !isLoading ? (
          <ZeroState icon={BriefcaseBusiness} isError heading={t(`operations.errors.${loadErrorKey}`)} testID="operations-load-error" />
        ) : (
          <Loading />
        )}
      </View>
    );
  }

  const summary = (
    <View testID="operations-summary">
      <Text className="text-typography-500">{`${t(`operations.status.${deployment.Status}`)} · ${t(`operations.financeMode.${deployment.FinanceMode}`)}`}</Text>
      <Text className="text-typography-500">{[deployment.IncidentNumber, deployment.RequestNumber, deployment.ResourceOrderNumber, deployment.CostCode].filter(Boolean).join(' · ') || t('operations.noNumbers')}</Text>
      <Text className="text-typography-500">{t('operations.roster', { units: deployment.Units.filter((unit) => unit.IsActive).length, personnel: deployment.Personnel.filter((person) => person.IsActive).length })}</Text>
      {timeAccess && timeAccess.CrewUnitIds.length > 0 ? (
        <Text className="text-typography-500">
          {t('operations.crewOf', {
            names: timeAccess.CrewUnitIds.map((unitId) => scopeName(deployment, { kind: 'crew', unitId }))
              .filter(Boolean)
              .join(', '),
          })}
        </Text>
      ) : null}
    </View>
  );

  const dayPicker =
    activeSection !== 'mars' ? (
      <View style={styles.dayRow}>
        <Pressable onPress={() => workspace.selectDay(shiftDateKey(dateKey, -1))} accessibilityRole="button" accessibilityLabel={t('operations.previousDay')} className="p-2" testID="operations-day-previous">
          <ChevronLeft size={22} color="#2563eb" />
        </Pressable>
        <DateTimeField value={dateKey} onChange={workspace.selectDay} label={t('dateTimePicker.date')} clearable={false} disabled={busy} testID="operations-day" />
        <Pressable onPress={() => workspace.selectDay(shiftDateKey(dateKey, 1))} accessibilityRole="button" accessibilityLabel={t('operations.nextDay')} className="p-2" testID="operations-day-next">
          <ChevronRight size={22} color="#2563eb" />
        </Pressable>
      </View>
    ) : null;

  const pickers =
    activeSection === 'time' ? (
      <View>
        {canApprove ? <AwaitingApproval deployment={deployment} reports={awaiting} onOpen={workspace.openReport} /> : null}
        <View className="mt-2">
          <ScopePicker deployment={deployment} scopes={scopes} current={scope} onPick={workspace.selectScope} />
        </View>
        {supervises ? (
          <View className="mt-2">
            <DayReports deployment={deployment} reports={dayReports} openId={report?.Id ?? null} onOpen={workspace.openReport} />
          </View>
        ) : null}
        {scopes.length === 0 && !supervises ? (
          <Text className="mt-2 text-typography-500" testID="operations-not-on-roster">
            {t('operations.time.notOnRoster')}
          </Text>
        ) : null}
      </View>
    ) : null;

  const sectionContent = (
    <View>
      {workspace.message ? (
        <Text accessibilityRole={workspace.message.tone === 'error' ? 'alert' : undefined} className={`mb-2 ${workspace.message.tone === 'error' ? 'text-error-600' : 'text-typography-600'}`} testID="operations-message">
          {t(workspace.message.key)}
        </Text>
      ) : null}
      {activeSection === 'time' && (scope || report) ? (
        <TimeReportEditor
          key={`${scopeKey(openScope)}:${dateKey}:${report?.Id ?? 'none'}`}
          dateKey={dateKey}
          report={report}
          entries={workspace.entries}
          subjects={subjects}
          names={names}
          scopeLabel={openScope ? scopeName(deployment, openScope) || scopeLabel(deployment, openScope) : ''}
          isCrew={openScope?.kind === 'crew'}
          coveredBy={covered}
          issues={workspace.issues}
          warnings={[]}
          canCreate={canCreate}
          canApprove={canApprove}
          canWrite={writable}
          dirty={workspace.dirty}
          busy={busy}
          onStart={() => void workspace.start()}
          onChange={workspace.setEntries}
          onSave={() => void workspace.save()}
          onSubmit={() => void workspace.submit()}
          onSign={(crewBoss, customer) => void workspace.sign(crewBoss, customer)}
          onApprove={() => void workspace.approve()}
        />
      ) : null}
      {activeSection === 'expenses' ? (
        <ExpensesPanel
          dateKey={dateKey}
          currency={deployment.Currency}
          expenses={expenses}
          reportId={report?.CanAct && report.Status === TimeReportStatus.Draft ? report.Id : null}
          userId={userId ?? null}
          canManage={!!timeAccess?.CanManage}
          canAdd={deployment.Status <= 3}
          busy={busy}
          onAdd={addExpense}
          onRemove={removeExpense}
        />
      ) : null}
      {activeSection === 'usage' ? <UsageForm dateKey={dateKey} units={usageUnits} defaultUnitId={activeUnitId} readings={usage} busy={busy} onAdd={addUsage} /> : null}
      {activeSection === 'mars' ? (
        <MarsPanel
          items={marsItems}
          validation={marsValidation}
          canDraft={canDraftF42}
          busy={busy}
          onDraft={() => void useCalOesMarsStore.getState().draftF42(id)}
          onValidate={(workItemId) => void useCalOesMarsStore.getState().validate(workItemId)}
        />
      ) : null}
    </View>
  );

  const twoColumns = !isPhone && (isLandscapeBoard || isDesktop) && activeSection === 'time';

  return (
    <View style={styles.screen} className="bg-background-0" testID="operations-deployment-screen">
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <OperationsFrame maxWidth={twoColumns ? 1280 : undefined}>
          {summary}
          {sections.length > 1 ? (
            <View className="mt-3">
              <Segments options={sections} value={activeSection} onChange={setSection} accessibilityLabel={t('operations.title')} />
            </View>
          ) : null}
          {dayPicker}
          {twoColumns ? (
            <View style={styles.columns}>
              <View style={styles.side}>{pickers}</View>
              <View style={styles.main}>{sectionContent}</View>
            </View>
          ) : (
            <>
              {pickers}
              <View className="mt-3">{sectionContent}</View>
            </>
          )}
        </OperationsFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 64 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 },
  side: { width: 360, marginRight: 16 },
  main: { flex: 1 },
});
