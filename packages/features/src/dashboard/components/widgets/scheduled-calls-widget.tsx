import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useCallsStore } from '@resgrid/data';
import { DispatchTicker } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { HStack, TypeIcon } from '@resgrid/ui';
import React, { useCallback, useMemo } from 'react';

import { useNow } from '../../hooks/use-now';
import { usePriorityLookup } from '../../hooks/use-priority-lookup';
import { useScheduledCallDispatches } from '../../hooks/use-scheduled-call-dispatches';
import { useStale } from '../../hooks/use-stale';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { minutesUntilActive, scheduledAt, scheduledUrgencyColor, selectScheduledCalls } from '../../lib/board-data';
import { SCHEDULED_CALLS_COLUMN_LABEL_KEYS } from '../../lib/column-labels';
import type { ScheduledCallsColumnKey } from '../../lib/widget-settings';
import { WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import { CellText, type TableColumn, WidgetTable } from '../widget-table';
import type { WidgetProps } from './types';

const COLUMN_FLEX: Readonly<Record<ScheduledCallsColumnKey, number>> = { name: 1.2, scheduledTime: 1.2, priority: 0.7, address: 1.2, dispatched: 1.8 };

/** "Nov 1, 14:30 (12m)" / "(3h)" / "(2d)" / "(overdue)". */
const useScheduledLabel = (): ((call: CallResultData, now: number) => string) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  return useCallback(
    (call: CallResultData, now: number) => {
      const at = scheduledAt(call);
      if (at === null) return '—';
      const minutes = minutesUntilActive(call, now) ?? 0;
      const time = formatUtcInDepartmentTime(at, null, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }, locale, '—');
      if (minutes < 0) return `${time} (${t('scheduledCalls.overdue')})`;
      if (minutes < 60) return `${time} (${Math.ceil(minutes)}m)`;
      if (minutes < 1440) return `${time} (${Math.floor(minutes / 60)}h)`;
      return `${time} (${Math.floor(minutes / 1440)}d)`;
    },
    [locale, t]
  );
};

/** Pending scheduled calls, colour-coded by how soon they go active, filtered by who they page, sorted as configured. */
export const ScheduledCallsWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure }) => {
  const { t } = useTranslation();
  const title = useWidgetTitle(WidgetTypes.SCHEDULED_CALLS);
  const scheduledCalls = useCallsStore((state) => state.scheduledCalls);
  const priorities = useCallsStore((state) => state.callPriorities);
  const isLoading = useCallsStore((state) => state.loading.scheduled === true);
  const hasError = useCallsStore((state) => !!state.errors.scheduled);
  const settings = useWidgetSettings('scheduledCalls');
  const now = useNow(30000);
  const stale = useStale(scheduledCalls.length > 0, hasError);
  const priorityOf = usePriorityLookup(priorities);
  const scheduledLabel = useScheduledLabel();
  const callIds = useMemo(() => scheduledCalls.map((call) => call.CallId), [scheduledCalls]);
  const hasFilter = settings.filterGroupIds.length + settings.filterUnitIds.length + settings.filterPersonnelIds.length + settings.filterRoleIds.length > 0;
  const dispatchesByCall = useScheduledCallDispatches(callIds, settings.showDispatched || hasFilter);
  const prioritiesById = useMemo(() => new Map(priorities.map((priority) => [priority.Id, priority])), [priorities]);
  const rows = useMemo(() => selectScheduledCalls(scheduledCalls, dispatchesByCall, prioritiesById, settings), [dispatchesByCall, prioritiesById, scheduledCalls, settings]);
  const { fontSize } = settings;

  const columns = useMemo<TableColumn<CallResultData>[]>(() => {
    const visible: Record<ScheduledCallsColumnKey, boolean> = {
      name: settings.showName,
      scheduledTime: settings.showScheduledTime,
      priority: settings.showPriority,
      address: settings.showAddress,
      dispatched: settings.showDispatched,
    };
    const render: Record<ScheduledCallsColumnKey, (call: CallResultData) => React.ReactNode> = {
      name: (call) => (
        <HStack space="xs" className="items-center">
          <TypeIcon iconUrl={call.TypeIconUrl ?? null} mapIcon={call.TypeMapIcon ?? null} size={fontSize + 4} />
          <CellText fontSize={fontSize}>{call.Name}</CellText>
        </HStack>
      ),
      scheduledTime: (call) => (
        <CellText fontSize={fontSize} color={scheduledUrgencyColor(minutesUntilActive(call, now), settings)}>
          {scheduledLabel(call, now)}
        </CellText>
      ),
      priority: (call) => {
        const priority = priorityOf(call.Priority);
        return (
          <CellText fontSize={fontSize} color={priority.color}>
            {priority.label}
          </CellText>
        );
      },
      address: (call) => (
        <CellText fontSize={fontSize} muted>
          {call.Address || t('dashboard.no_address')}
        </CellText>
      ),
      dispatched: (call) => {
        const dispatches = dispatchesByCall[call.CallId] ?? [];
        return dispatches.length > 0 ? (
          <DispatchTicker dispatches={dispatches} animate={settings.scrollDispatches} />
        ) : (
          <CellText fontSize={fontSize} muted>
            —
          </CellText>
        );
      },
    };
    return settings.columnOrder.filter((key) => visible[key]).map((key) => ({ key, label: t(SCHEDULED_CALLS_COLUMN_LABEL_KEYS[key]), flex: COLUMN_FLEX[key], render: render[key] }));
  }, [dispatchesByCall, fontSize, now, priorityOf, scheduledLabel, settings, t]);

  return (
    <WidgetContainer title={title} testID="scheduled-calls-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale}>
      {isLoading && scheduledCalls.length === 0 ? (
        <WidgetLoading testID="scheduled-calls-widget-loading" />
      ) : hasError && scheduledCalls.length === 0 ? (
        <WidgetMessage message={t('dashboard.failed_to_load')} tone="error" testID="scheduled-calls-widget-error" />
      ) : (
        <WidgetTable columns={columns} rows={rows} rowKey={(call) => call.CallId} fontSize={fontSize} emptyMessage={t('scheduledCalls.noScheduledCalls')} testID="scheduled-calls-table" />
      )}
    </WidgetContainer>
  );
};
