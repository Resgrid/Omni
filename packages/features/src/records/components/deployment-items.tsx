import { useTranslation } from '@resgrid/i18n';
import type { RecordDeploymentConnectorData, RecordDeploymentConnectorRunData, RecordDeploymentData, RecordDeploymentFillData, RecordDeploymentReconciliationData } from '@resgrid/models';
import { Badge, BadgeText, Pressable, Text } from '@resgrid/ui';
import { AlertTriangle, ChevronRight, Globe, RadioTower } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { connectorStateAction, connectorStateKey, deploymentStatusAction, fillStatusAction, formatWhen, isConnectorOwned, runOutcomeAction, statusKey } from '../lib/deployment-format';

// Rows for deployments, fills, reconciliation items, connectors and connector runs (RMS plan §4.1). Presentation only:
// every value shown came from the server, and no row offers a way to change a fill or an order — those are a
// coordinator's actions on the web.

const Avatar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View className="mr-3 items-center justify-center rounded-full bg-primary-100" style={styles.avatar}>
    {children}
  </View>
);

export interface RecordsEntryRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  count?: number;
  /** Warning colour for the count (things to reconcile). */
  attention?: boolean;
  onPress: () => void;
  testID?: string;
}

/** A navigation row on the Records home: icon, title, a line of context and an optional count. */
export const RecordsEntryRow: React.FC<RecordsEntryRowProps> = ({ icon, title, subtitle, count, attention = false, onPress, testID }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={count ? `${title}, ${count}` : title} className="px-4 py-3" testID={testID}>
    <View style={styles.row}>
      <Avatar>{icon}</Avatar>
      <View style={styles.body}>
        <Text className="font-medium text-typography-900" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text size="xs" className="text-typography-500" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {count !== undefined && count > 0 ? (
        <Badge action={attention ? 'warning' : 'info'} size="sm" className="mr-2">
          <BadgeText testID={testID ? `${testID}-count` : undefined}>{String(count)}</BadgeText>
        </Badge>
      ) : null}
      <ChevronRight size={18} color="#94a3b8" />
    </View>
  </Pressable>
);

const incidentLine = (deployment: Pick<RecordDeploymentData, 'IncidentName' | 'IncidentNumber'>): string => [deployment.IncidentName, deployment.IncidentNumber].filter(Boolean).join(' · ');

export const DeploymentListItem: React.FC<{ deployment: RecordDeploymentData; conflicts?: number; onPress: () => void; testID?: string }> = ({ deployment, conflicts, onPress, testID }) => {
  const { t } = useTranslation();
  const connectorOwned = isConnectorOwned(deployment);
  const status = t(`records.deployment_status_${statusKey(deployment.Status)}`, { defaultValue: deployment.Status });
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${deployment.OrderNumber}, ${status}`} className="px-4 py-3" testID={testID}>
      <View style={styles.row}>
        <Avatar>{connectorOwned ? <RadioTower size={18} color="#2563eb" /> : <Globe size={18} color="#2563eb" />}</Avatar>
        <View style={styles.body}>
          <Text className="font-medium text-typography-900" numberOfLines={1}>
            {deployment.OrderNumber}
          </Text>
          <Text size="xs" className="text-typography-500" numberOfLines={1}>
            {incidentLine(deployment)}
          </Text>
          <Text size="xs" className="text-typography-400" numberOfLines={1}>
            {[deployment.SourceScheme, deployment.SourceSystem, connectorOwned ? t('records.connector_maintained') : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.end}>
          <Badge action={deploymentStatusAction(deployment.Status)} size="sm">
            <BadgeText>{status}</BadgeText>
          </Badge>
          {conflicts ? (
            <Badge action="warning" size="sm" className="mt-1" testID={testID ? `${testID}-conflicts` : undefined}>
              <BadgeText>{t('records.reconciliation_count', { count: conflicts })}</BadgeText>
            </Badge>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

export const DeploymentFillItem: React.FC<{ fill: RecordDeploymentFillData; testID?: string }> = ({ fill, testID }) => {
  const { t } = useTranslation();
  const what = [fill.Position, fill.ResourceType, fill.ResourceKind].filter(Boolean).join(' · ');
  const when = fill.NeededOn ? formatWhen(fill.NeededOn) : '';
  const meta = [fill.HomeUnit, when ? `${t('records.needed_on')} ${when}` : null].filter(Boolean).join(' · ');
  return (
    <View className="px-4 py-2" testID={testID}>
      <View style={styles.row}>
        <View style={styles.body}>
          <Text className="font-medium text-typography-900" numberOfLines={1}>
            {[fill.RequestNumber, fill.RequestCategory, fill.IsTrainee ? t('records.trainee') : null].filter(Boolean).join(' · ')}
          </Text>
          {what ? (
            <Text size="xs" className="text-typography-500" numberOfLines={1}>
              {what}
            </Text>
          ) : null}
          {meta ? (
            <Text size="xs" className="text-typography-400" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {fill.DeclineReason ? (
            <Text size="xs" className="text-error-600" numberOfLines={2}>
              {fill.DeclineReason}
            </Text>
          ) : null}
        </View>
        <Badge action={fillStatusAction(fill.Status)} size="sm">
          <BadgeText>{t(`records.fill_status_${statusKey(fill.Status)}`, { defaultValue: fill.Status })}</BadgeText>
        </Badge>
      </View>
    </View>
  );
};

/** One disagreement between the source and the department's record. Shown, never applied. */
export const ReconciliationListItem: React.FC<{ item: RecordDeploymentReconciliationData; showOrder?: boolean; onPress?: () => void; testID?: string }> = ({ item, showOrder = false, onPress, testID }) => {
  const { t } = useTranslation();
  const kind = t(`records.reconciliation_${item.Kind}`, { defaultValue: item.Kind });
  const body = (
    <View style={styles.rowTop}>
      <View style={styles.leadIcon}>
        <AlertTriangle size={18} color="#d97706" />
      </View>
      <View style={styles.body}>
        <Text className="font-medium text-typography-900" numberOfLines={2}>
          {kind}
        </Text>
        <Text size="xs" className="text-typography-500" numberOfLines={1}>
          {[showOrder ? item.OrderNumber : null, item.RequestNumber].filter(Boolean).join(' · ')}
        </Text>
        <Text size="xs" className="text-typography-500" numberOfLines={2}>
          {`${t('records.source_says')} ${item.SourceStatus ?? '—'} · ${t('records.your_record_says')} ${item.LocalStatus ?? '—'}`}
        </Text>
        {item.SourceCapturedOn ? (
          <Text size="xs" className="text-typography-400" numberOfLines={1}>
            {[formatWhen(item.SourceCapturedOn), item.SourceVersion ? `v${item.SourceVersion}` : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      {onPress ? <ChevronRight size={18} color="#94a3b8" /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={kind} className="px-4 py-3" testID={testID}>
      {body}
    </Pressable>
  ) : (
    <View className="px-4 py-3" testID={testID}>
      {body}
    </View>
  );
};

export const ConnectorListItem: React.FC<{ connector: RecordDeploymentConnectorData; conflicts?: number; onPress: () => void; testID?: string }> = ({ connector, conflicts, onPress, testID }) => {
  const { t } = useTranslation();
  const state = t(connectorStateKey(connector));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${connector.Name}, ${state}`} className="px-4 py-3" testID={testID}>
      <View style={styles.row}>
        <Avatar>
          <RadioTower size={18} color="#2563eb" />
        </Avatar>
        <View style={styles.body}>
          <Text className="font-medium text-typography-900" numberOfLines={1}>
            {connector.Name}
          </Text>
          <Text size="xs" className="text-typography-500" numberOfLines={1}>
            {[connector.ProviderKey, connector.SourceScheme, connector.ProfileKey].join(' · ')}
          </Text>
          <Text size="xs" className="text-typography-400" numberOfLines={1}>
            {connector.LastPolledOn ? `${t('records.last_read')} ${formatWhen(connector.LastPolledOn)}` : t('records.never_read')}
          </Text>
          {connector.LastError ? (
            <Text size="xs" className="text-error-600" numberOfLines={2}>
              {connector.LastError}
            </Text>
          ) : null}
        </View>
        <View style={styles.end}>
          <Badge action={connectorStateAction(connector)} size="sm">
            <BadgeText>{state}</BadgeText>
          </Badge>
          {conflicts ? (
            <Badge action="warning" size="sm" className="mt-1">
              <BadgeText>{t('records.reconciliation_count', { count: conflicts })}</BadgeText>
            </Badge>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

export const ConnectorRunItem: React.FC<{ run: RecordDeploymentConnectorRunData; testID?: string }> = ({ run, testID }) => {
  const { t } = useTranslation();
  return (
    <View className="px-4 py-2" testID={testID}>
      <View style={styles.rowTop}>
        <View style={styles.body}>
          <Text size="sm" className="text-typography-900" numberOfLines={1}>
            {`${formatWhen(run.StartedOn)} · ${t(`records.run_trigger_${run.Trigger}`, { defaultValue: run.Trigger })}`}
          </Text>
          <Text size="xs" className="text-typography-500" numberOfLines={2}>
            {t('records.run_counts', {
              seen: run.OrdersSeen,
              created: run.OrdersCreated,
              snapshots: run.SnapshotsRecorded,
              requests: run.RequestsAdded,
              unchanged: run.Unchanged,
              rejected: run.Rejected,
              conflicts: run.Conflicts,
            })}
          </Text>
          {run.Error ? (
            <Text size="xs" className="text-error-600" numberOfLines={3}>
              {run.Error}
            </Text>
          ) : null}
        </View>
        <Badge action={runOutcomeAction(run.Outcome)} size="sm">
          <BadgeText>{t(`records.run_outcome_${run.Outcome}`, { defaultValue: run.Outcome })}</BadgeText>
        </Badge>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start' },
  body: { flex: 1, marginRight: 8 },
  end: { alignItems: 'flex-end' },
  avatar: { width: 40, height: 40 },
  leadIcon: { marginRight: 12, marginTop: 2 },
});
