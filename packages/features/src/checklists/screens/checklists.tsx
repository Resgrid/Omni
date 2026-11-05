import { useAuthStore } from '@resgrid/auth';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { generateDataId, toDataError, useChecklistsStore } from '@resgrid/data';
import { ProtectedRevealBar } from '@resgrid/features/data-protection';
import { useTranslation } from '@resgrid/i18n';
import type { ChecklistRun, ChecklistTarget } from '@resgrid/models';
import { Loading, SharedTabs, type TabItem, Text, useFormFactor, useRouteTab, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams } from 'expo-router';
import { ClipboardCheck } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChecklistCalendar } from '../components/checklist-calendar';
import { ChecklistFilterChips, ChecklistSearchField } from '../components/checklist-list-controls';
import { ChecklistHistoryRow, DueCheckRow, StartableChecklistCard } from '../components/checklist-rows';
import { ChecklistRunSheet } from '../components/checklist-run-sheet';
import { ChecklistListFooter, ChecklistTabPanel } from '../components/checklist-tab-panel';
import { useChecklistHistory, useChecklistsFlagStatus, useChecklistUnitId, useDueChecklists } from '../hooks/use-checklists';
import { checklistNames, DUE_FILTERS, type DueFilter, dueFilterCounts, filterDefinitions, filterDueChecks, filterHistory, HISTORY_FILTERS, type HistoryFilter, type StartableChecklist } from '../lib/checklist-filters';
import { checklistErrorKey, localRunForDefinition } from '../lib/checklist-form';
import { previewChecklistOccurrence } from '../lib/checklists-api';

export interface ChecklistsScreenProps {
  /** Defaults to the `occurrenceId` route param: opens that scheduled check (calendar entry, reminder). */
  occurrenceId?: string;
}

const firstParam = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

type ChecklistTab = 'due' | 'start' | 'history' | 'calendar';
const TABS: readonly ChecklistTab[] = ['due', 'start', 'history', 'calendar'];
const TAB_KEYS = TABS.map((key) => ({ key }));

const DUE_FILTER_LABEL: Record<DueFilter, string> = {
  all: 'checklists.ui.filterAll',
  missed: 'checklists.labels.Missed',
  inProgress: 'checklists.labels.InProgress',
  scheduled: 'checklists.labels.Scheduled',
};

const HISTORY_FILTER_LABEL: Record<HistoryFilter, string> = {
  all: 'checklists.ui.filterAll',
  passed: 'checklists.labels.Passed',
  failed: 'checklists.labels.Failed',
  awaitingWitness: 'checklists.labels.AwaitingWitness',
  inProgress: 'checklists.labels.InProgress',
};

/**
 * Readiness checklists (Responder baseline; Unit identical except it checks the device's active unit), as four tabs:
 * Due (scheduled checks, filterable by state), Start (on-demand forms per target), History (runs, filterable by
 * outcome) and Calendar (one month of scheduled checks). One search box narrows every tab by checklist and target
 * name. The run sheet opens over them. Nothing is cached on the device — runs can carry protected answers; a protected
 * department shows the reveal bar. Wide screens centre the tabs in a readable column.
 */
export default function ChecklistsScreen({ occurrenceId: occurrenceProp }: ChecklistsScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ occurrenceId?: string | string[] }>();
  const routeOccurrence = firstParam(params.occurrenceId);
  const occurrenceId = occurrenceProp ?? (routeOccurrence && isSafeRouteId(routeOccurrence) ? routeOccurrence : undefined);
  const { isPhone } = useFormFactor();
  const flagStatus = useChecklistsFlagStatus();
  const unitId = useChecklistUnitId();
  const userId = useAuthStore((state) => state.userId);
  const access = useChecklistsStore((state) => state.access);
  const fetchAccess = useChecklistsStore((state) => state.fetchAccess);
  const fetchRun = useChecklistsStore((state) => state.fetchRun);
  const [query, setQuery] = useState('');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [calendarRevision, setCalendarRevision] = useState(0);
  const [active, setActive] = useState<ChecklistRun | null>(null);
  const [openErrorKey, setOpenErrorKey] = useState<string | null>(null);
  const enabled = flagStatus === 'enabled' && access?.Enabled !== false;
  const { due, isLoading, isLoadingMore, errorKey, reload, loadMore } = useDueChecklists(enabled, unitId);
  const history = useChecklistHistory(unitId);

  // In the route's params, so the tab survives opening another screen and coming Back.
  const routeTab = useRouteTab(TAB_KEYS);
  const tab = TABS[routeTab.activeIndex] ?? 'due';

  useEffect(() => {
    if (flagStatus === 'enabled') void fetchAccess({ bypassCache: true });
  }, [flagStatus, fetchAccess]);

  const open = useCallback(async (load: () => Promise<ChecklistRun | null>) => {
    setOpenErrorKey(null);
    try {
      const run = await load();
      if (run) setActive(run);
      else setOpenErrorKey('denied');
    } catch (error) {
      setOpenErrorKey(checklistErrorKey(toDataError(error)) ?? 'retry');
    }
  }, []);

  const openOccurrence = useCallback((id: string) => void open(() => previewChecklistOccurrence(id)), [open]);
  const openHistoryRun = useCallback((id: string) => void open(() => fetchRun(id, undefined, { bypassCache: true })), [open, fetchRun]);
  const startDefinition = useCallback(
    ({ definition }: StartableChecklist, target: ChecklistTarget) => {
      if (!userId) return;
      setActive(localRunForDefinition(definition, target, generateDataId(), userId, access?.IsProtected === true, new Date().toISOString()));
    },
    [userId, access?.IsProtected]
  );

  const opened = React.useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !occurrenceId || opened.current === occurrenceId) return;
    opened.current = occurrenceId;
    openOccurrence(occurrenceId);
  }, [enabled, occurrenceId, openOccurrence]);

  const selectTab = useCallback(
    (index: number) => {
      routeTab.selectIndex(index);
      if (TABS[index] === 'history' && !history.loaded && !history.isLoading) void history.reload();
    },
    [history, routeTab]
  );

  // Back can land on History (the tab is kept in the route): load it as tapping the tab would, once per error.
  useEffect(() => {
    if (tab === 'history' && !history.loaded && !history.isLoading && history.errorKey === null) void history.reload();
  }, [tab, history]);

  const refreshAll = useCallback(async () => {
    await reload();
    setCalendarRevision((revision) => revision + 1);
    if (history.loaded) await history.reload();
  }, [reload, history]);

  const dueRows = useMemo(() => due?.Occurrences ?? [], [due]);
  const counts = useMemo(() => dueFilterCounts(dueRows), [dueRows]);
  const shownDue = useMemo(() => filterDueChecks(dueRows, query, dueFilter), [dueRows, query, dueFilter]);
  const startable = useMemo(() => filterDefinitions(due?.Definitions ?? [], query), [due, query]);
  const names = useMemo(() => checklistNames(due), [due]);
  const shownHistory = useMemo(() => filterHistory(history.rows, query, historyFilter, names), [history.rows, query, historyFilter, names]);
  const isFiltered = query.trim() !== '';

  if (flagStatus === 'disabled' || access?.Enabled === false) return <ZeroState icon={ClipboardCheck} heading={t('checklists.unavailable')} testID="checklists-disabled" />;
  if (flagStatus === 'unknown') return <Loading />;

  const shownError = openErrorKey ?? errorKey;
  const search = (key: ChecklistTab) => <ChecklistSearchField value={query} onChange={setQuery} testID={`checklists-${key}-search`} />;

  const dueTab = (
    <ChecklistTabPanel
      refreshing={isLoading}
      onRefresh={() => void refreshAll()}
      testID="checklists-due"
      header={
        <>
          {search('due')}
          <ChecklistFilterChips
            options={DUE_FILTERS.map((value) => ({ value, label: t('checklists.ui.filterCount', { label: t(DUE_FILTER_LABEL[value]), total: counts[value] }) }))}
            value={dueFilter}
            onChange={setDueFilter}
            testID="checklists-due-filter"
          />
        </>
      }
    >
      <Text size="sm" className="mb-2 text-typography-500">
        {t('checklists.labels.DueGuidance')}
      </Text>
      {shownDue.map((row) => (
        <DueCheckRow key={row.Id} row={row} disabled={isLoading} onOpen={openOccurrence} />
      ))}
      <ChecklistListFooter
        emptyText={!due || shownDue.length > 0 ? null : dueRows.length > 0 || isFiltered ? t('checklists.ui.noMatches') : t('checklists.labels.NoDueChecks')}
        hasMore={due?.HasMoreOccurrences === true}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => void loadMore()}
        testID="checklists-due-list"
      />
    </ChecklistTabPanel>
  );

  const startTab = (
    <ChecklistTabPanel refreshing={isLoading} onRefresh={() => void refreshAll()} testID="checklists-start" header={search('start')}>
      <Text size="sm" className="mb-2 text-typography-500">
        {t('checklists.ui.startGuidance')}
      </Text>
      {startable.map((item) => (
        <StartableChecklistCard key={item.definition.Id} item={item} onStart={startDefinition} />
      ))}
      <ChecklistListFooter
        emptyText={!due || startable.length > 0 ? null : due.Definitions.length > 0 || isFiltered ? t('checklists.ui.noMatches') : t('checklists.ui.noChecklists')}
        hasMore={due?.HasMoreDefinitions === true}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => void loadMore()}
        testID="checklists-start-list"
      />
    </ChecklistTabPanel>
  );

  const historyTab = (
    <ChecklistTabPanel
      refreshing={history.loaded ? history.isLoading : false}
      onRefresh={() => void history.reload()}
      testID="checklists-history"
      header={
        <>
          {search('history')}
          <ChecklistFilterChips options={HISTORY_FILTERS.map((value) => ({ value, label: t(HISTORY_FILTER_LABEL[value]) }))} value={historyFilter} onChange={setHistoryFilter} testID="checklists-history-filter" />
        </>
      }
    >
      {history.errorKey ? (
        <Text accessibilityRole="alert" className="mb-2 text-error-600">
          {t(`checklists.errors.${history.errorKey}`)}
        </Text>
      ) : null}
      {!history.loaded && history.isLoading ? <Loading /> : null}
      {shownHistory.map((row) => (
        <ChecklistHistoryRow key={row.Id} row={row} name={names.get(row.DefinitionId)} onOpen={openHistoryRun} />
      ))}
      <ChecklistListFooter
        emptyText={!history.loaded || shownHistory.length > 0 ? null : history.rows.length > 0 || isFiltered ? t('checklists.ui.noMatches') : t('checklists.ui.noHistory')}
        hasMore={history.hasMore}
        isLoadingMore={history.isLoadingMore}
        onLoadMore={() => void history.loadMore()}
        testID="checklists-history-list"
      />
    </ChecklistTabPanel>
  );

  const calendarTab = (
    <ChecklistTabPanel refreshing={false} onRefresh={() => setCalendarRevision((revision) => revision + 1)} testID="checklists-calendar" header={search('calendar')}>
      <ChecklistCalendar onOpenOccurrence={openOccurrence} revision={calendarRevision} query={query} />
    </ChecklistTabPanel>
  );

  const tabs: TabItem[] = [
    { key: 'due', title: 'checklists.ui.tabDue', content: dueTab, badge: dueRows.length, badgeVariant: counts.missed > 0 ? 'critical' : 'warning' },
    { key: 'start', title: 'checklists.ui.tabStart', content: startTab },
    { key: 'history', title: 'checklists.labels.History', content: historyTab },
    { key: 'calendar', title: 'checklists.ui.calendar', content: calendarTab },
  ];

  return (
    <View style={styles.screen} className="bg-background-50" testID="checklists-screen">
      {access?.IsProtected ? <ProtectedRevealBar onRefresh={refreshAll} testID="checklists-protected-bar" /> : null}
      <View style={isPhone ? styles.column : StyleSheet.flatten([styles.column, styles.centered])}>
        {shownError ? (
          <Text accessibilityRole="alert" className="mx-4 mt-3 text-error-600" testID="checklists-error">
            {t(`checklists.errors.${shownError}`)}
          </Text>
        ) : null}
        <SharedTabs tabs={tabs} activeIndex={routeTab.activeIndex} onChange={selectTab} variant="pills" className="flex-1" />
      </View>
      <ChecklistRunSheet
        run={active}
        onClose={() => setActive(null)}
        onSaved={(run) => {
          if (run) setActive(run);
          void reload();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, width: '100%' },
  centered: { alignSelf: 'center', maxWidth: 960 },
});
