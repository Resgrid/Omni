import { useAuthStore, useTerm } from '@resgrid/auth';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { generateDataId, toDataError, useChecklistsStore } from '@resgrid/data';
import { ProtectedRevealBar } from '@resgrid/features/data-protection';
import { useTranslation } from '@resgrid/i18n';
import type { ChecklistDefinition, ChecklistRun, ChecklistTarget } from '@resgrid/models';
import { Button, ButtonText, Heading, Loading, RefreshControl, Text, useFormFactor, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams } from 'expo-router';
import { ClipboardCheck } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ChecklistCalendar } from '../components/checklist-calendar';
import { ChecklistRunSheet } from '../components/checklist-run-sheet';
import { useChecklistHistory, useChecklistsFlagStatus, useChecklistUnitId, useDueChecklists } from '../hooks/use-checklists';
import { checklistErrorKey, localRunForDefinition } from '../lib/checklist-form';
import { previewChecklistOccurrence } from '../lib/checklists-api';

export interface ChecklistsScreenProps {
  /** Defaults to the `occurrenceId` route param: opens that scheduled check (calendar entry, reminder). */
  occurrenceId?: string;
}

const firstParam = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

const Card: React.FC<{ children: React.ReactNode; testID?: string }> = ({ children, testID }) => (
  <View className="mb-3 rounded-lg border border-outline-200 bg-background-0 p-3" testID={testID}>
    {children}
  </View>
);

/**
 * Readiness checklists (Responder baseline; Unit identical except it checks the device's active unit): due checks,
 * on-demand forms, a month calendar and history, with the run sheet over them. Nothing is cached on the device —
 * runs can carry protected answers; a protected department shows the reveal bar. Wide screens put history and the
 * calendar beside the due list.
 */
export default function ChecklistsScreen({ occurrenceId: occurrenceProp }: ChecklistsScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ occurrenceId?: string | string[] }>();
  const routeOccurrence = firstParam(params.occurrenceId);
  const occurrenceId = occurrenceProp ?? (routeOccurrence && isSafeRouteId(routeOccurrence) ? routeOccurrence : undefined);
  const { isPhone, isLandscapeBoard, isDesktop } = useFormFactor();
  const title = useTerm('module.checklists', t('checklists.labels.Checklists'));
  const flagStatus = useChecklistsFlagStatus();
  const unitId = useChecklistUnitId();
  const userId = useAuthStore((state) => state.userId);
  const access = useChecklistsStore((state) => state.access);
  const fetchAccess = useChecklistsStore((state) => state.fetchAccess);
  const fetchRun = useChecklistsStore((state) => state.fetchRun);
  const [page, setPage] = useState(0);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [calendarRevision, setCalendarRevision] = useState(0);
  const [active, setActive] = useState<ChecklistRun | null>(null);
  const [openErrorKey, setOpenErrorKey] = useState<string | null>(null);
  const enabled = flagStatus === 'enabled' && access?.Enabled !== false;
  const { due, isLoading, errorKey, reload } = useDueChecklists(enabled, page, unitId);
  const history = useChecklistHistory(unitId);
  const twoColumns = !isPhone && (isLandscapeBoard || isDesktop);

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
    (definition: ChecklistDefinition, target: ChecklistTarget) => {
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

  const refreshAll = useCallback(async () => {
    await reload();
    setCalendarRevision((revision) => revision + 1);
    if (showHistory) await history.load(history.page);
  }, [reload, showHistory, history]);

  if (flagStatus === 'disabled' || access?.Enabled === false) return <ZeroState icon={ClipboardCheck} heading={t('checklists.unavailable')} testID="checklists-disabled" />;
  if (flagStatus === 'unknown') return <Loading />;

  const shownError = openErrorKey ?? errorKey;

  const dueList = (
    <View>
      <Heading size="md" className="mb-1" accessibilityRole="header">
        {t('checklists.labels.DueChecks')}
      </Heading>
      <Text size="sm" className="mb-2 text-typography-500">
        {t('checklists.labels.DueGuidance')}
      </Text>
      {due?.Occurrences.map((row) => (
        <Card key={row.Id} testID={`checklist-due-${row.Id}`}>
          <Text className="font-semibold text-typography-900">{row.Name}</Text>
          <Text size="sm" className="text-typography-600">{`${row.Target.Name} · ${formatUtcInDepartmentTime(row.PeriodStartUtc, null)}`}</Text>
          {row.WindowEndUtc ? <Text size="xs" className="text-typography-500">{`${t('checklists.labels.WindowEnds')}: ${formatUtcInDepartmentTime(row.WindowEndUtc, null)}`}</Text> : null}
          <Button size="sm" className="mt-2 self-start" isDisabled={isLoading || !row.CanStart} onPress={() => openOccurrence(row.Id)} testID={`checklist-open-${row.Id}`}>
            <ButtonText>{t('checklists.labels.OpenCheck')}</ButtonText>
          </Button>
        </Card>
      ))}
      {due && due.Occurrences.length === 0 ? (
        <Text className="mb-3 text-typography-500" testID="checklists-no-due">
          {t('checklists.labels.NoDueChecks')}
        </Text>
      ) : null}

      <Heading size="sm" className="mb-2 mt-2" accessibilityRole="header">
        {t('checklists.labels.StartRun')}
      </Heading>
      {due?.Definitions.map((definition) => (
        <Card key={definition.Id} testID={`checklist-definition-${definition.Id}`}>
          <Text className="font-semibold text-typography-900">{definition.PublishedForm.Name}</Text>
          <View style={styles.wrap}>
            {definition.Targets.map((target) => (
              <Button key={`${target.Type}:${target.Id}`} variant="outline" size="sm" className="mr-2 mt-2" onPress={() => startDefinition(definition, target)} testID={`checklist-start-${definition.Id}-${target.Id}`}>
                <ButtonText>{target.Name}</ButtonText>
              </Button>
            ))}
          </View>
        </Card>
      ))}
      {due && due.Definitions.length === 0 ? <Text className="mb-3 text-typography-500">{t('checklists.labels.NoDefinitions')}</Text> : null}
      <View style={styles.pager}>
        <Button variant="outline" size="sm" isDisabled={page === 0} onPress={() => setPage((n) => n - 1)} testID="checklists-previous-page">
          <ButtonText>{t('checklists.labels.Previous')}</ButtonText>
        </Button>
        <Button variant="outline" size="sm" isDisabled={!(due?.HasMoreDefinitions === true || due?.HasMoreOccurrences === true)} onPress={() => setPage((n) => n + 1)} testID="checklists-next-page">
          <ButtonText>{t('checklists.labels.Next')}</ButtonText>
        </Button>
      </View>
    </View>
  );

  const extras = (
    <View>
      <View style={styles.wrap}>
        <Button variant={showCalendar ? 'solid' : 'outline'} size="sm" className="mb-2 mr-2" onPress={() => setShowCalendar((value) => !value)} testID="checklists-calendar-toggle">
          <ButtonText>{t('checklists.ui.calendar')}</ButtonText>
        </Button>
        <Button
          variant={showHistory ? 'solid' : 'outline'}
          size="sm"
          className="mb-2"
          onPress={() => {
            const next = !showHistory;
            setShowHistory(next);
            if (next) void history.load(0);
          }}
          testID="checklists-history-toggle"
        >
          <ButtonText>{t('checklists.labels.History')}</ButtonText>
        </Button>
      </View>
      {showCalendar ? (
        <Card>
          <ChecklistCalendar onOpenOccurrence={openOccurrence} revision={calendarRevision} />
        </Card>
      ) : null}
      {showHistory ? (
        <View testID="checklists-history">
          {history.errorKey ? (
            <Text accessibilityRole="alert" className="text-error-600">
              {t(`checklists.errors.${history.errorKey}`)}
            </Text>
          ) : null}
          {history.rows.map((row) => (
            <Button key={row.Id} variant="outline" size="sm" className="mb-2" onPress={() => openHistoryRun(row.Id)} testID={`checklist-history-${row.Id}`}>
              <ButtonText>{`${row.TargetName} · ${formatUtcInDepartmentTime(row.UpdatedOn, null)}`}</ButtonText>
            </Button>
          ))}
          <View style={styles.pager}>
            <Button variant="outline" size="sm" isDisabled={history.page === 0 || history.isLoading} onPress={() => void history.load(history.page - 1)} testID="checklists-history-previous">
              <ButtonText>{t('checklists.labels.Previous')}</ButtonText>
            </Button>
            <Button variant="outline" size="sm" isDisabled={!history.hasMore || history.isLoading} onPress={() => void history.load(history.page + 1)} testID="checklists-history-next">
              <ButtonText>{t('checklists.labels.Next')}</ButtonText>
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen} className="bg-background-50" testID="checklists-screen">
      {access?.IsProtected ? <ProtectedRevealBar onRefresh={refreshAll} testID="checklists-protected-bar" /> : null}
      <ScrollView refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refreshAll()} />} contentContainerStyle={styles.content}>
        <View style={isPhone ? styles.full : StyleSheet.flatten([styles.full, styles.centered, { maxWidth: twoColumns ? 1280 : 960 }])}>
          <Text className="mb-2 text-xl font-bold text-typography-900" accessibilityRole="header">
            {title}
          </Text>
          {shownError ? (
            <Text accessibilityRole="alert" className="mb-2 text-error-600" testID="checklists-error">
              {t(`checklists.errors.${shownError}`)}
            </Text>
          ) : null}
          {twoColumns ? (
            <View style={styles.columns}>
              <View style={styles.column}>{dueList}</View>
              <View style={styles.sideColumn}>{extras}</View>
            </View>
          ) : (
            <>
              {extras}
              {dueList}
            </>
          )}
        </View>
      </ScrollView>
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
  content: { padding: 16, paddingBottom: 48 },
  full: { width: '100%' },
  centered: { alignSelf: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  pager: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8 },
  columns: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flex: 1, marginRight: 16 },
  sideColumn: { width: 380 },
});
