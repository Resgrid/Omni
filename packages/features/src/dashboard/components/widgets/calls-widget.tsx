import { useNow } from '@resgrid/core/lifecycle/use-now';
import { selectActiveCalls, useCallsStore } from '@resgrid/data';
import { callDisplayName, callDisplayText, DispatchTicker } from '@resgrid/features/calls';
import { CallNavigationEtas } from '@resgrid/features/navigation-eta';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { HStack, TypeIcon, VStack } from '@resgrid/ui';
import React, { useMemo } from 'react';

import { usePriorityLookup } from '../../hooks/use-priority-lookup';
import { useStale } from '../../hooks/use-stale';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { CALLS_COLUMN_LABEL_KEYS } from '../../lib/column-labels';
import { ELAPSED_KEYS, elapsedSince } from '../../lib/format';
import type { CallsColumnKey } from '../../lib/widget-settings';
import { WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import { CellText, type TableColumn, WidgetTable } from '../widget-table';
import type { WidgetProps } from './types';

const COLUMN_FLEX: Readonly<Record<CallsColumnKey, number>> = { id: 0.5, name: 1.2, address: 1.2, timestamp: 0.9, priority: 0.7, dispatched: 1.8 };

/** Shown when every column is switched off, so the board still names its calls. */
const FALLBACK_COLUMNS: readonly CallsColumnKey[] = ['name'];

/**
 * The department's active calls (pending calls never count) as BigBoard's dense column list: one line per call, with
 * the columns, column order, font size and dispatch scrolling configured for the board. Call cards belong to the apps a
 * person works from; a wall board needs every call on screen at once. Dispatch badges come from the calls store's
 * per-call cache, and units navigating to a call in the Unit app show their live ETAs under its dispatches.
 */
export const CallsWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure }) => {
  const { t } = useTranslation();
  const title = useWidgetTitle(WidgetTypes.CALLS);
  const calls = useCallsStore((state) => state.calls);
  const priorities = useCallsStore((state) => state.callPriorities);
  const dispatchesByCall = useCallsStore((state) => state.callDispatches);
  const isLoading = useCallsStore((state) => state.loading.calls === true);
  const hasError = useCallsStore((state) => !!state.errors.calls);
  const settings = useWidgetSettings('calls');
  const now = useNow(30000, settings.showTimestamp);
  const active = useMemo(() => selectActiveCalls({ calls }), [calls]);
  const priorityOf = usePriorityLookup(priorities);
  const stale = useStale(active.length > 0, hasError);
  const { fontSize } = settings;
  const protectedLabel = t('data_protection.protected_value');

  const columns = useMemo<TableColumn<CallResultData>[]>(() => {
    const visible: Record<CallsColumnKey, boolean> = {
      id: settings.showId,
      name: settings.showName,
      address: settings.showAddress,
      timestamp: settings.showTimestamp,
      priority: settings.showPriority,
      dispatched: settings.showDispatched,
    };

    const render: Record<CallsColumnKey, (call: CallResultData) => React.ReactNode> = {
      id: (call) => (
        <CellText fontSize={fontSize} bold>
          {call.Number}
        </CellText>
      ),
      name: (call) => (
        <HStack space="xs" className="items-center">
          <TypeIcon iconUrl={call.TypeIconUrl ?? null} mapIcon={call.TypeMapIcon ?? null} size={fontSize + 4} />
          <CellText fontSize={fontSize}>{callDisplayName(call, protectedLabel)}</CellText>
        </HStack>
      ),
      address: (call) => (
        <CellText fontSize={fontSize} muted>
          {callDisplayText(call, 'Address', protectedLabel) || t('dashboard.no_address')}
        </CellText>
      ),
      timestamp: (call) => {
        const elapsed = elapsedSince(call.LoggedOnUtc, now);

        return (
          <CellText fontSize={fontSize} muted>
            {elapsed ? t(ELAPSED_KEYS[elapsed.unit], { count: elapsed.count }) : ''}
          </CellText>
        );
      },
      priority: (call) => {
        const priority = priorityOf(call.Priority);

        return (
          <CellText fontSize={fontSize} color={priority.color}>
            {priority.label}
          </CellText>
        );
      },
      dispatched: (call) => {
        const dispatches = dispatchesByCall[call.CallId] ?? [];

        return (
          <VStack>
            {dispatches.length > 0 ? (
              <DispatchTicker dispatches={dispatches} animate={settings.scrollDispatches} fontSize={fontSize} testID={`calls-widget-ticker-${call.CallId}`} />
            ) : (
              <CellText fontSize={fontSize} muted>
                —
              </CellText>
            )}
            <CallNavigationEtas callId={call.CallId} dispatches={dispatches} fontSize={Math.max(9, fontSize - 3)} testID={`calls-widget-etas-${call.CallId}`} />
          </VStack>
        );
      },
    };

    const keys = settings.columnOrder.filter((key) => visible[key]);
    const shown = keys.length > 0 ? keys : FALLBACK_COLUMNS;

    return shown.map((key) => ({ key, label: t(CALLS_COLUMN_LABEL_KEYS[key]), flex: COLUMN_FLEX[key], render: render[key] }));
  }, [dispatchesByCall, fontSize, now, priorityOf, protectedLabel, settings, t]);

  return (
    <WidgetContainer title={title} testID="calls-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale} dense>
      {isLoading && active.length === 0 ? (
        <WidgetLoading testID="calls-widget-loading" />
      ) : hasError && active.length === 0 ? (
        <WidgetMessage message={t('dashboard.failed_to_load')} tone="error" testID="calls-widget-error" />
      ) : (
        <WidgetTable columns={columns} rows={active} rowKey={(call) => call.CallId} fontSize={fontSize} emptyMessage={t('dashboard.no_active_calls')} testID="calls-table" />
      )}
    </WidgetContainer>
  );
};
