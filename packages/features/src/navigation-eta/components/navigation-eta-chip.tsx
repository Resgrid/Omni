import { type NavigationEta, useUnitsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { DispatchedEventResultData } from '@resgrid/models';
import { Text, useThemeColors } from '@resgrid/ui';
import { Navigation, TimerOff } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useCallNavigationEtas, useUnitNavigationEta } from '../hooks/use-navigation-eta';
import { navigationEtaParts } from '../lib/eta-text';

export interface NavigationEtaChipProps {
  eta: NavigationEta;
  /** Shown before the ETA where the chip stands apart from its unit's row (a call's responding units). */
  label?: string | null;
  /** Wall boards scale their text (dashboard widget font size). */
  fontSize?: number;
  testID?: string;
}

const DEFAULT_FONT_SIZE = 11;

/**
 * "ETA 4 min · traffic" for a navigating unit (MapLibre plan §9.4): primary colours while the unit reports, greyed with
 * a "no update" marker after 60 seconds without a report.
 */
export const NavigationEtaChip: React.FC<NavigationEtaChipProps> = ({ eta, label = null, fontSize = DEFAULT_FONT_SIZE, testID = `navigation-eta-${eta.unitId}` }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const parts = navigationEtaParts(t, eta);
  const text = label ? `${label} · ${parts.join(' · ')}` : parts.join(' · ');
  const tone = eta.isStale
    ? { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textSubtle }
    : { backgroundColor: colors.token('primary-500', 0.12), borderColor: colors.token('primary-500', 0.35), color: colors.primaryStrong };
  const iconSize = Math.max(10, Math.round(fontSize));
  const accessibilityLabel = eta.isStale ? `${text}. ${t('navigation_eta.stale_hint')}` : text;

  return (
    <View
      style={StyleSheet.flatten([styles.chip, { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor }])}
      accessible
      accessibilityLabel={accessibilityLabel}
      testID={eta.isStale ? `${testID}-stale` : testID}
    >
      <View style={styles.icon}>{eta.isStale ? <TimerOff size={iconSize} color={tone.color} /> : <Navigation size={iconSize} color={tone.color} />}</View>
      <Text style={StyleSheet.flatten([styles.text, { fontSize, color: tone.color }])} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
};

export interface UnitNavigationEtaChipProps {
  unitId: string | number | null | undefined;
  /** Only an ETA to this call (a unit on two calls drives to one of them). */
  callId?: string | number | null;
  label?: string | null;
  fontSize?: number;
  testID?: string;
}

/** A unit's live ETA chip; renders nothing while the unit is not navigating (or not to `callId`). */
export const UnitNavigationEtaChip: React.FC<UnitNavigationEtaChipProps> = React.memo(({ unitId, callId, label, fontSize, testID }) => {
  const eta = useUnitNavigationEta(unitId, callId);
  return eta ? <NavigationEtaChip eta={eta} label={label} fontSize={fontSize} testID={testID} /> : null;
});

UnitNavigationEtaChip.displayName = 'UnitNavigationEtaChip';

export interface CallNavigationEtasProps {
  callId: string | number | null | undefined;
  /** The call's dispatches: unit names come from them first, then from the units list. */
  dispatches?: readonly DispatchedEventResultData[] | null;
  fontSize?: number;
  testID?: string;
}

/** Same reading of `Type` as the calls feature's dispatch badges ("Unit", "Units"…). */
const isUnitDispatch = (dispatch: DispatchedEventResultData): boolean =>
  String(dispatch.Type ?? '')
    .toLowerCase()
    .includes('unit');

/** The units navigating to a call, each with its ETA ("Engine 7 · ETA 4 min"); nothing while none is. */
export const CallNavigationEtas: React.FC<CallNavigationEtasProps> = ({ callId, dispatches = null, fontSize, testID = `call-navigation-etas-${String(callId ?? '')}` }) => {
  const etas = useCallNavigationEtas(callId);
  const units = useUnitsStore((state) => state.unitInfos);
  const names = useMemo(() => {
    const byId = new Map<string, string>();
    for (const unit of units) if (unit.UnitId && unit.Name) byId.set(String(unit.UnitId), unit.Name);
    for (const dispatch of dispatches ?? []) if (isUnitDispatch(dispatch) && dispatch.Id && dispatch.Name) byId.set(String(dispatch.Id), dispatch.Name);
    return byId;
  }, [dispatches, units]);

  if (etas.length === 0) return null;
  return (
    <View style={styles.row} testID={testID}>
      {etas.map((eta) => (
        <View key={eta.unitId} style={styles.rowItem}>
          <NavigationEtaChip eta={eta} label={names.get(eta.unitId) ?? null} fontSize={fontSize} />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, maxWidth: '100%' },
  icon: { marginRight: 4 },
  text: { fontWeight: '600', flexShrink: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  rowItem: { marginRight: 4, marginBottom: 2 },
});
