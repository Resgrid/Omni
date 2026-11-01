import { useSecurity } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, ScrollView, Text, TypeIcon, View, VStack } from '@resgrid/ui';
import { BellOff, ChevronDown, ChevronRight, CircleCheck, TriangleAlert } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useStale } from '../../hooks/use-stale';
import { useUnitAlerts } from '../../hooks/use-unit-alerts';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { formatElapsed } from '../../lib/format';
import { acknowledgedColors, alertColors, type AnnotatedUnit, canAcknowledgeUnit, compareAnnotatedUnits, countUnitsWithoutMeaning } from '../../lib/unit-status-alerts';
import { WidgetTypes } from '../../lib/widget-types';
import { UnitAlertAcknowledgeSheet } from '../unit-alert-acknowledge-sheet';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import type { WidgetProps } from './types';

/**
 * Only the units sitting in a status longer than the department allows (the Units widget highlights them in place; this
 * is the dedicated panel). Muted alerts collapse into their own section; "no timers configured" and "everything within
 * its timer" are told apart, and units whose status has no meaning (so no timer can ever apply) are counted.
 */
export const UnitAlertsWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure }) => {
  const { t } = useTranslation();
  const title = useWidgetTitle(WidgetTypes.UNIT_ALERTS);
  const isDark = useColorScheme().colorScheme === 'dark';
  const { canUserCreateCalls } = useSecurity();
  const { annotated, units, thresholds, noteRequirement, configLoaded, thresholdsUnsupported, isLoading, hasError } = useUnitAlerts();
  const stale = useStale(units.length > 0, hasError);
  const [showMuted, setShowMuted] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const closeSheet = useCallback(() => setSelectedUnitId(null), []);

  const { active, muted } = useMemo(() => {
    const breaching = annotated.filter((entry) => entry.alert.level !== 'none').sort(compareAnnotatedUnits);
    return { active: breaching.filter((entry) => entry.acknowledgementState !== 'muted'), muted: breaching.filter((entry) => entry.acknowledgementState === 'muted') };
  }, [annotated]);
  const withoutMeaning = useMemo(() => countUnitsWithoutMeaning(units, thresholds), [units, thresholds]);
  // Looked up from the live list so the sheet follows the unit as it escalates or a colleague acts on it.
  const selected = useMemo(() => [...active, ...muted].find((entry) => entry.unit.UnitId === selectedUnitId) ?? null, [active, muted, selectedUnitId]);

  const renderRow = (entry: AnnotatedUnit) => {
    const { unit, alert, acknowledgement, acknowledgementState } = entry;
    const isMuted = acknowledgementState === 'muted';
    const isAcknowledged = acknowledgementState === 'acknowledged';
    const colors = isMuted || isAcknowledged ? acknowledgedColors(alert.level, isDark) : alertColors(alert.level, isDark);
    const detail = [unit.CurrentStatus || t('common.unknown'), unit.GroupName].filter((part) => !!part).join(' · ');
    const seenBy = acknowledgement?.AcknowledgedByName ? t('unitAlerts.acknowledgedBy', { name: acknowledgement.AcknowledgedByName }) : t('unitAlerts.acknowledged');
    const Icon = isMuted ? BellOff : isAcknowledged ? CircleCheck : TriangleAlert;
    const content = (
      <HStack
        space="sm"
        className="items-center rounded px-2 py-1"
        style={StyleSheet.flatten([styles.row, { backgroundColor: colors.background, borderLeftColor: colors.edge, opacity: isMuted ? 0.7 : 1 }])}
        testID={`unit-alert-${alert.level}${isAcknowledged ? '-acknowledged' : ''}${isMuted ? '-muted' : ''}`}
      >
        <View>
          <Icon size={14} color={colors.edge} />
        </View>
        <VStack className="flex-1">
          <HStack space="xs" className="items-center">
            <TypeIcon iconUrl={unit.TypeIconUrl ?? null} mapIcon={unit.TypeMapIcon ?? null} size={16} />
            <Text className="flex-shrink text-sm font-semibold text-typography-900" numberOfLines={1}>
              {unit.Name}
            </Text>
          </HStack>
          <Text className="text-xs text-typography-600" numberOfLines={1}>
            {detail}
          </Text>
          {isAcknowledged || isMuted ? (
            <Text className="text-xs text-typography-700" numberOfLines={2} testID={`unit-alert-acknowledgement-${unit.UnitId}`}>
              {acknowledgement?.Note ? `${seenBy}: ${acknowledgement.Note}` : seenBy}
            </Text>
          ) : null}
        </VStack>
        <Text className="text-sm font-bold" style={{ color: colors.edge }}>
          {formatElapsed(alert.secondsInStatus)}
        </Text>
      </HStack>
    );
    return canAcknowledgeUnit(unit, canUserCreateCalls, isEditMode) ? (
      <Pressable
        key={unit.UnitId}
        onPress={() => setSelectedUnitId(unit.UnitId)}
        accessibilityRole="button"
        accessibilityLabel={t('unitAlerts.openAcknowledge', { name: unit.Name })}
        testID={`unit-alert-row-${unit.UnitId}`}
      >
        {content}
      </Pressable>
    ) : (
      <View key={unit.UnitId}>{content}</View>
    );
  };

  const body = (() => {
    // Only an explicit list confirms the department's timers; a failed load or an older server is "unknown", not "none".
    if ((hasError && units.length === 0) || thresholdsUnsupported) return <WidgetMessage message={t('unitAlerts.errorLoading')} tone="error" testID="unit-alerts-error" />;
    if (!configLoaded || (isLoading && units.length === 0)) return <WidgetLoading testID="unit-alerts-loading" />;
    const nothingBreaching = active.length === 0 && muted.length === 0;
    return (
      <ScrollView style={styles.fill} nestedScrollEnabled>
        <VStack space="xs">
          {active.map(renderRow)}
          {muted.length > 0 ? (
            <VStack space="xs">
              <Pressable onPress={() => setShowMuted((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: showMuted }} testID="unit-alerts-muted-toggle">
                <HStack space="xs" className="items-center px-1 py-1">
                  <View>{showMuted ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}</View>
                  <Text className="text-xs font-semibold text-typography-600">{t('unitAlerts.mutedSection', { count: muted.length })}</Text>
                </HStack>
              </Pressable>
              {showMuted ? muted.map(renderRow) : null}
            </VStack>
          ) : null}
          {nothingBreaching && withoutMeaning === 0 ? (
            <View style={styles.message}>
              <Text className="text-center text-sm text-typography-600" testID="unit-alerts-empty">
                {thresholds.length === 0 ? t('unitAlerts.noThresholds') : t('unitAlerts.withinThresholds')}
              </Text>
            </View>
          ) : null}
          {withoutMeaning > 0 ? (
            <View style={nothingBreaching ? styles.message : styles.footnote}>
              <Text className="text-center text-xs text-warning-700" testID="unit-alerts-without-meaning">
                {t('unitAlerts.unitsWithoutMeaning', { count: withoutMeaning })}
              </Text>
            </View>
          ) : null}
        </VStack>
      </ScrollView>
    );
  })();

  return (
    <WidgetContainer title={title} testID="unit-alerts-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale}>
      {body}
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { borderLeftWidth: 3 },
  message: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 8 },
  footnote: { paddingHorizontal: 4, paddingTop: 8 },
});
