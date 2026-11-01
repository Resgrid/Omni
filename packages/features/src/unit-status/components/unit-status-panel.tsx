import { UnitRolesButton } from '@resgrid/features/roles';
import { type StatusOption, UnitStatusSheet, useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Text, useFormFactor, View, VStack, ZeroState } from '@resgrid/ui';
import { type Href, router } from 'expo-router';
import { Settings } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useActiveUnit } from '../hooks/use-active-unit';
import { consoleMetrics } from '../lib/console-layout';
import type { QuickActionId } from '../lib/quick-actions';
import { ActiveCallCard } from './active-call-card';
import { CheckInSummary } from './check-in-summary';
import { CurrentStatusCard } from './current-status-card';
import { QuickActions } from './quick-actions';
import { SharedSessionCard } from './shared-session-card';
import { StatusButtons } from './status-buttons';
import { UnitSummaryCard } from './unit-summary-card';

export interface UnitStatusPanelProps {
  /** Close the drawer after navigating (no-op for a permanent sidebar). */
  onNavigate?: () => void;
  /** Clears the crew's active call (the shell owns the active call); the deselect action is hidden without it. */
  onClearActiveCall?: () => void;
  /** Quick actions whose routes this variant does not have. */
  excludeQuickActions?: readonly QuickActionId[];
  /** `sidebar`: one column (drawer / permanent sidebar) · `screen`: the full-screen console, two columns when wide. */
  layout?: 'sidebar' | 'screen';
  testID?: string;
}

interface SheetRequest {
  statusId: string | number | null;
  holdConfirmed: boolean;
}

/**
 * The Unit app's status console (omni-plan §7.11): the active unit and its voice channel, current status and crew seats,
 * the active call with directions, the most urgent check-in timer, the shared-session controls, shortcuts and the status
 * buttons. A status button opens the shared unit status sheet (destinations, notes, GPS, hold-to-confirm) which saves
 * through the outbox. On an MDT (Electron / desktop window) targets grow to 64 px and the screen layout splits in two.
 */
export const UnitStatusPanel: React.FC<UnitStatusPanelProps> = ({ onNavigate, onClearActiveCall, excludeQuickActions, layout = 'sidebar', testID = 'unit-status-panel' }) => {
  const { t } = useTranslation();
  const formFactor = useFormFactor();
  const metrics = useMemo(() => consoleMetrics(formFactor), [formFactor]);
  const context = useStatusContext();
  const { unitId, unit, unitInfo, statuses, status } = useActiveUnit();
  const [sheet, setSheet] = useState<SheetRequest | null>(null);

  const openSheet = useCallback((option: StatusOption, holdConfirmed: boolean) => setSheet({ statusId: option.Id, holdConfirmed }), []);
  const goToSettings = useCallback(() => {
    router.push('/settings' as Href);
    onNavigate?.();
  }, [onNavigate]);

  const wide = layout === 'screen' && metrics.twoColumn;
  const statusColumns = layout === 'screen' ? metrics.statusColumns : 1;

  const summary = (
    <VStack space="md">
      <UnitSummaryCard unit={unit} unitInfo={unitInfo} buttonSize={Math.max(44, metrics.buttonMinHeight - 8)} iconSize={metrics.iconSize} />
      {unitId ? <CurrentStatusCard status={status} /> : null}
      {unitId ? <UnitRolesButton unitId={unitId} /> : null}
      <ActiveCallCard
        activeCallId={context.activeCallId}
        onSelectCall={context.onActiveCallChange}
        onClearCall={onClearActiveCall}
        onNavigate={onNavigate}
        buttonMinHeight={metrics.buttonMinHeight}
        iconSize={metrics.iconSize}
      />
      <CheckInSummary activeCallId={context.activeCallId} />
      <SharedSessionCard buttonMinHeight={metrics.buttonMinHeight} iconSize={metrics.iconSize} />
      <QuickActions hasActiveUnit={!!unitId} onNavigate={onNavigate} exclude={excludeQuickActions} columns={wide ? 2 : 1} buttonMinHeight={metrics.buttonMinHeight} iconSize={metrics.iconSize} />
    </VStack>
  );

  const buttons =
    !unitId || statuses.length === 0 ? (
      <ZeroState
        icon={Settings}
        iconSize={56}
        heading={unitId ? t('status.no_statuses_available') : t('common.noActiveUnit')}
        description={unitId ? undefined : t('common.noActiveUnitDescription')}
        viewClassName="w-full px-2 pb-4 pt-0"
        centerClassName="p-4"
        testID={`${testID}-empty`}
      >
        {unitId ? null : (
          <Button onPress={goToSettings} testID={`${testID}-settings`} style={{ minHeight: metrics.buttonMinHeight }}>
            <ButtonText>{t('settings.title')}</ButtonText>
          </Button>
        )}
      </ZeroState>
    ) : (
      <VStack space="xs">
        {layout === 'screen' ? <Text className="text-xs font-semibold uppercase text-typography-500">{t('status.set_status')}</Text> : null}
        <StatusButtons statuses={statuses} currentStatusId={status.statusId} holdToConfirm={context.holdToConfirm} onSelect={openSheet} metrics={{ ...metrics, statusColumns }} />
      </VStack>
    );

  return (
    <View testID={testID} style={styles.fill}>
      {wide ? (
        <View style={styles.row}>
          <View style={styles.wideLeft}>{buttons}</View>
          <View style={styles.wideRight}>{summary}</View>
        </View>
      ) : (
        <VStack space="md">
          {summary}
          {buttons}
        </VStack>
      )}
      <UnitStatusSheet isOpen={sheet !== null} onClose={() => setSheet(null)} unitId={unitId} initialStatusId={sheet?.statusId ?? null} initialHoldConfirmed={sheet?.holdConfirmed ?? false} />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  wideLeft: { flex: 3, paddingRight: 12 },
  wideRight: { flex: 2, paddingLeft: 12 },
});
