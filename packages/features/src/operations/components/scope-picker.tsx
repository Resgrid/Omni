import { useTranslation } from '@resgrid/i18n';
import type { Deployment, TimeReport } from '@resgrid/models';
import { Pressable, Text } from '@resgrid/ui';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { dateOf, documentNumberLabel, reportNumberText, reportScope, scopeKey, scopeName, sumHours, type TimeScope } from '../lib/time';
import { Segments } from './operations-layout';

/** "Crew: Engine 41", "My time", "Whole deployment"… for a scope. */
export const useScopeLabel = (): ((deployment: Deployment, scope: TimeScope | null) => string) => {
  const { t } = useTranslation();
  return useCallback(
    (deployment: Deployment, scope: TimeScope | null) => {
      if (!scope) return '';
      if (scope.kind === 'deployment') return t('operations.scope.deployment');
      if (scope.kind === 'individual' && scope.personnelId === deployment.TimeAccess?.PersonnelId) return t('operations.scope.mine');
      return scope.kind === 'crew' ? t('operations.scope.crew', { name: scopeName(deployment, scope) }) : t('operations.scope.individual', { name: scopeName(deployment, scope) });
    },
    [t]
  );
};

export interface ScopePickerProps {
  deployment: Deployment;
  scopes: TimeScope[];
  current: TimeScope | null;
  onPick: (scope: TimeScope) => void;
}

/**
 * Which report the person works on: their crew's Crew Time Report, their own time, or — for a manager — the
 * deployment-wide DTR. Only the scopes the server's TimeAccess grants are offered.
 */
export const ScopePicker: React.FC<ScopePickerProps> = ({ deployment, scopes, current, onPick }) => {
  const label = useScopeLabel();
  if (scopes.length < 2) return null;
  const byKey = new Map(scopes.map((scope) => [scopeKey(scope), scope]));
  return (
    <Segments
      options={scopes.map((scope) => ({ value: scopeKey(scope), label: label(deployment, scope), testID: `operations-scope-${scopeKey(scope)}` }))}
      value={scopeKey(current) || null}
      onChange={(key) => {
        const scope = byKey.get(key);
        if (scope) onPick(scope);
      }}
    />
  );
};

const ReportRow: React.FC<{ deployment: Deployment; report: TimeReport; selected?: boolean; onOpen: (report: TimeReport) => void; testID: string; compact?: boolean }> = ({
  deployment,
  report,
  selected = false,
  onOpen,
  testID,
  compact = false,
}) => {
  const { t } = useTranslation();
  const label = useScopeLabel();
  const title = `${documentNumberLabel(reportNumberText(report))} · ${label(deployment, reportScope(report))}`;
  return (
    <Pressable
      onPress={() => onOpen(report)}
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      className={compact ? 'py-1' : `mb-2 rounded-lg border p-2 ${selected ? 'border-primary-500' : 'border-outline-200'}`}
    >
      {compact ? (
        <Text size="sm" className="text-primary-600">{`${dateOf(report.ReportDate)} · ${title}`}</Text>
      ) : (
        <>
          <View style={styles.row}>
            <Text size="sm" className="flex-1 text-typography-900">
              {title}
            </Text>
            <Text size="sm" className="text-typography-500">{`${t(`operations.reportStatus.${report.Status}`)} · ${t('operations.time.hours', { hours: sumHours(report.Entries) })}`}</Text>
          </View>
          <Text size="xs" className="text-typography-500">
            {dateOf(report.ReportDate)}
          </Text>
        </>
      )}
    </Pressable>
  );
};

/** Every live report on the day (managers and approvers): who it covers, its status and hours. */
export const DayReports: React.FC<{ deployment: Deployment; reports: TimeReport[]; openId: string | null; onOpen: (report: TimeReport) => void }> = ({ deployment, reports, openId, onOpen }) => {
  const { t } = useTranslation();
  if (reports.length === 0) return null;
  return (
    <View testID="operations-day-reports">
      <Text className="mb-1 font-semibold text-typography-900">{t('operations.time.dayReports')}</Text>
      {reports.map((report) => (
        <ReportRow key={report.Id} deployment={deployment} report={report} selected={report.Id === openId} onOpen={onOpen} testID={`operations-day-report-${report.Id}`} />
      ))}
    </View>
  );
};

/** Submitted reports on any day, oldest first: the approver's queue for this deployment. */
export const AwaitingApproval: React.FC<{ deployment: Deployment; reports: TimeReport[]; onOpen: (report: TimeReport) => void }> = ({ deployment, reports, onOpen }) => {
  const { t } = useTranslation();
  if (reports.length === 0) return null;
  return (
    <View className="rounded-lg bg-background-50 p-3" testID="operations-awaiting-approval">
      <Text className="font-semibold text-typography-900">{t('operations.time.awaitingApproval', { count: reports.length })}</Text>
      {reports.map((report) => (
        <ReportRow key={report.Id} deployment={deployment} report={report} onOpen={onOpen} compact testID={`operations-awaiting-${report.Id}`} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
