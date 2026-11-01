import { useSecurity } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Text, TypeIcon, View } from '@resgrid/ui';
import { BellOff, CircleCheck } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useMemo, useState } from 'react';

import { useNow } from '../../hooks/use-now';
import { useStale } from '../../hooks/use-stale';
import { useUnitAlerts } from '../../hooks/use-unit-alerts';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { UNITS_COLUMN_LABEL_KEYS } from '../../lib/column-labels';
import { ELAPSED_KEYS, elapsedSince, formatElapsed, normalizeColor } from '../../lib/format';
import { acknowledgedColors, alertColors, type AnnotatedUnit, canAcknowledgeUnit, compareAnnotatedUnits } from '../../lib/unit-status-alerts';
import type { UnitsColumnKey } from '../../lib/widget-settings';
import { WidgetTypes } from '../../lib/widget-types';
import { UnitAlertAcknowledgeSheet } from '../unit-alert-acknowledge-sheet';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import { CellText, type TableColumn, WidgetTable } from '../widget-table';
import type { WidgetProps } from './types';

const COLUMN_FLEX: Readonly<Record<UnitsColumnKey, number>> = { name: 1, station: 0.8, type: 0.7, state: 0.7, timestamp: 0.9 };

/**
 * The department's units as a table with status timers: a unit past its time-in-status threshold is highlighted (red
 * alert / amber warning), sorted to the top and — for users with the Create Call right — can be acknowledged or muted.
 */
export const UnitsWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure }) => {
  const { t } = useTranslation();
  const title = useWidgetTitle(WidgetTypes.UNITS);
  const isDark = useColorScheme().colorScheme === 'dark';
  const { canUserCreateCalls } = useSecurity();
  const { annotated, units, thresholds, noteRequirement, isLoading, hasError } = useUnitAlerts();
  const settings = useWidgetSettings('units');
  const now = useNow(60000, settings.showTimestamp);
  const stale = useStale(units.length > 0, hasError);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const closeSheet = useCallback(() => setSelectedUnitId(null), []);
  const { fontSize } = settings;

  const rows = useMemo(() => {
    const hidden = new Set(settings.hideGroups);
    const visible = hidden.size > 0 ? annotated.filter((entry) => !entry.unit.GroupId || !hidden.has(String(entry.unit.GroupId))) : annotated;
    // Breaching units first: the point is that a dispatcher spots them without reading the whole board.
    return thresholds.length > 0 ? [...visible].sort(compareAnnotatedUnits) : visible;
  }, [annotated, settings.hideGroups, thresholds.length]);
  const selected = useMemo(() => rows.find((entry) => entry.unit.UnitId === selectedUnitId && entry.alert.level !== 'none') ?? null, [rows, selectedUnitId]);

  const columns = useMemo<TableColumn<AnnotatedUnit>[]>(() => {
    const visible: Record<UnitsColumnKey, boolean> = { name: true, station: settings.showStation, type: settings.showType, state: settings.showState, timestamp: settings.showTimestamp };
    const render: Record<UnitsColumnKey, (entry: AnnotatedUnit) => React.ReactNode> = {
      name: ({ unit }) => (
        <HStack space="xs" className="items-center">
          <TypeIcon iconUrl={unit.TypeIconUrl ?? null} mapIcon={unit.TypeMapIcon ?? null} size={fontSize + 4} testID={`unit-type-icon-${unit.UnitId}`} />
          <CellText fontSize={fontSize} bold>
            {unit.Name}
          </CellText>
        </HStack>
      ),
      station: ({ unit }) => (
        <CellText fontSize={fontSize} muted>
          {unit.GroupName}
        </CellText>
      ),
      type: ({ unit }) => (
        <CellText fontSize={fontSize} muted>
          {unit.Type}
        </CellText>
      ),
      state: ({ unit }) => (
        <CellText fontSize={fontSize} color={normalizeColor(unit.CurrentStatusColor)}>
          {unit.CurrentStatus || t('common.unknown')}
        </CellText>
      ),
      timestamp: ({ unit }) => {
        const elapsed = elapsedSince(unit.CurrentStatusTimestampUtc, now);
        return (
          <CellText fontSize={fontSize} muted>
            {elapsed ? t(ELAPSED_KEYS[elapsed.unit], { count: elapsed.count }) : ''}
          </CellText>
        );
      },
    };
    return settings.columnOrder.filter((key) => visible[key]).map((key) => ({ key, label: t(UNITS_COLUMN_LABEL_KEYS[key]), flex: COLUMN_FLEX[key], render: render[key] }));
  }, [fontSize, now, settings, t]);

  const rowStyle = useCallback(
    ({ alert, acknowledgementState }: AnnotatedUnit) => {
      if (alert.level === 'none' || acknowledgementState === 'muted') return undefined;
      const colors = acknowledgementState === 'acknowledged' ? acknowledgedColors(alert.level, isDark) : alertColors(alert.level, isDark);
      return { backgroundColor: colors.background, borderLeftWidth: 3, borderLeftColor: colors.edge };
    },
    [isDark]
  );

  const trailing = useCallback(
    ({ alert, acknowledgementState }: AnnotatedUnit) => {
      if (alert.level === 'none') return null;
      const color = alertColors(alert.level, isDark).edge;
      return (
        <HStack space="xs" className="items-center pl-1">
          {acknowledgementState === 'muted' ? (
            <View>
              <BellOff size={fontSize} color={color} />
            </View>
          ) : acknowledgementState === 'acknowledged' ? (
            <View>
              <CircleCheck size={fontSize} color={color} />
            </View>
          ) : null}
          <Text className="font-semibold" style={{ fontSize, color }} numberOfLines={1}>
            {formatElapsed(alert.secondsInStatus)}
          </Text>
        </HStack>
      );
    },
    [fontSize, isDark]
  );

  return (
    <WidgetContainer title={title} testID="units-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale}>
      {isLoading && units.length === 0 ? (
        <WidgetLoading testID="units-widget-loading" />
      ) : hasError && units.length === 0 ? (
        <WidgetMessage message={t('dashboard.failed_to_load')} tone="error" testID="units-widget-error" />
      ) : (
        <WidgetTable
          columns={columns}
          rows={rows}
          rowKey={(entry) => entry.unit.UnitId}
          fontSize={fontSize}
          emptyMessage={t('dashboard.no_units')}
          testID="units-table"
          rowStyle={rowStyle}
          rowTestID={({ alert, acknowledgementState }) => (alert.level !== 'none' ? `unit-row-${alert.level}${acknowledgementState === 'none' ? '' : `-${acknowledgementState}`}` : undefined)}
          trailing={trailing}
          onRowPress={(entry) => setSelectedUnitId(entry.unit.UnitId)}
          isRowPressable={(entry) => entry.alert.level !== 'none' && canAcknowledgeUnit(entry.unit, canUserCreateCalls, isEditMode)}
          rowAccessibilityLabel={(entry) => t('unitAlerts.openAcknowledge', { name: entry.unit.Name })}
        />
      )}
      <UnitAlertAcknowledgeSheet
        isOpen={selected !== null}
        onClose={closeSheet}
        unit={selected?.unit ?? null}
        alert={selected?.alert ?? null}
        acknowledgement={selected?.acknowledgement ?? null}
        acknowledgementState={selected?.acknowledgementState ?? 'none'}
        noteRequirement={noteRequirement}
      />
    </WidgetContainer>
  );
};
