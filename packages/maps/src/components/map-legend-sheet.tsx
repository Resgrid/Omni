import { useTranslation } from '@resgrid/i18n';
import type { GetMapIconLegendResultData, MapLegendRowData, MapLegendStyleData } from '@resgrid/models';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getPoiColor } from '../lib/poi';
import { useMapServices, useMapTheme } from '../provider/context';
import { MapSheet } from '../provider/overlays';
import { PinMarkerIcon } from './pin-marker';
import { SheetButton, SheetHeader } from './sheet-parts';

/** Legend (baseline Responder map-legend-sheet): every icon the department's map can show, in its own names. */

const STYLE_LABEL_KEYS: Record<string, string> = {
  available: 'maps.legend.style.available',
  dispatched: 'maps.legend.style.dispatched',
  responding: 'maps.legend.style.responding',
  onscene: 'maps.legend.style.onscene',
  transporting: 'maps.legend.style.transporting',
  returning: 'maps.legend.style.returning',
  staging: 'maps.legend.style.staging',
  delayed: 'maps.legend.style.delayed',
  unavailable: 'maps.legend.style.unavailable',
  low: 'maps.legend.style.low',
  medium: 'maps.legend.style.medium',
  high: 'maps.legend.style.high',
  emergency: 'maps.legend.style.emergency',
};

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export interface NormalizedLegend {
  statusStyles: MapLegendStyleData[];
  priorityStyles: MapLegendStyleData[];
  calls: MapLegendRowData[];
  units: MapLegendRowData[];
  personnel: MapLegendRowData[];
  poiTypes: NonNullable<GetMapIconLegendResultData['PoiTypes']>;
}

const asArray = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value.filter((item) => item != null) : []);
const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Every list present (absent / null lists from older servers become empty). */
export const normalizeMapLegend = (data: GetMapIconLegendResultData | null | undefined): NormalizedLegend => {
  const rows = (value: MapLegendRowData[] | null | undefined) => asArray(value).map((row) => ({ ...row, States: asArray(row.States) }));
  return {
    statusStyles: asArray(data?.StatusStyles),
    priorityStyles: asArray(data?.PriorityStyles),
    calls: rows(data?.Calls),
    units: rows(data?.Units),
    personnel: rows(data?.Personnel),
    poiTypes: asArray(data?.PoiTypes),
  };
};

export interface MapLegendSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** From the rights DTO (`CanViewPII`): the map hides personnel pins without it, so the legend does too. */
  canViewPersonnel: boolean;
  /** Department terminology (`useTerm`) for the section titles; defaults to the generic labels. */
  terms?: { calls?: string; units?: string; personnel?: string };
  /** Defaults to the provider's `services.loadMapIconLegend` (`Mapping/GetMapIconLegend`). */
  loadLegend?: (signal?: AbortSignal) => Promise<GetMapIconLegendResultData | null>;
}

type LegendStatus = 'loading' | 'loaded' | 'error';

export const MapLegendSheet: React.FC<MapLegendSheetProps> = ({ isOpen, onClose, canViewPersonnel, terms, loadLegend }) => {
  const { t } = useTranslation();
  const { colors } = useMapTheme();
  const services = useMapServices();
  const load = loadLegend ?? services.loadMapIconLegend;
  const [status, setStatus] = useState<LegendStatus>('loading');
  const [legend, setLegend] = useState<NormalizedLegend | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Asked again on every open, so department changes show next time.
  useEffect(() => {
    if (!isOpen) return undefined;
    const controller = new AbortController();
    setStatus('loading');
    setLegend(null);
    load(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setLegend(normalizeMapLegend(data));
        setStatus('loaded');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [isOpen, attempt, load]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const styleLabel = (key: string, kind: 'status' | 'priority'): string => {
    const normalized = asText(key).toLowerCase();
    if (!normalized || normalized === 'unknown') return kind === 'status' ? t('maps.legend.style.unknown') : t('maps.legend.no_meaning');
    return STYLE_LABEL_KEYS[normalized] ? t(STYLE_LABEL_KEYS[normalized]) : asText(key);
  };
  const callsTitle = terms?.calls ?? t('maps.legend.calls');
  const unitsTitle = terms?.units ?? t('maps.legend.units');
  const personnelTitle = terms?.personnel ?? t('maps.legend.personnel');

  const heading = (title: string, testID: string) => (
    <Text style={StyleSheet.flatten([styles.heading, { color: colors.text }])} accessibilityRole="header" testID={testID}>
      {title}
    </Text>
  );

  const styleRow = (style: MapLegendStyleData, kind: 'status' | 'priority', index: number) => {
    const label = styleLabel(style.Key, kind);
    const key = asText(style.Key).toLowerCase() || `style-${index}`;
    const color = HEX_COLOR.test(asText(style.Color)) ? asText(style.Color) : null;
    const names = kind === 'priority' ? asArray(style.Priorities) : [...asArray(style.UnitStatuses), ...(canViewPersonnel ? asArray(style.PersonnelStatuses) : [])];
    const pin = kind === 'priority' ? style.CallPinIconUrl : style.UnitPinIconUrl;
    return (
      <View key={key} style={StyleSheet.flatten([styles.row, { borderColor: colors.border }])} testID={`map-legend-${kind}-${key}`}>
        <PinMarkerIcon pinIconUrl={pin} fallbackToBundled={false} size={28} accessibilityLabel={label} />
        <View style={StyleSheet.flatten([styles.swatch, color ? { backgroundColor: color } : { borderWidth: 1, borderColor: colors.border }])} />
        <View style={styles.rowText}>
          <Text style={StyleSheet.flatten([styles.rowTitle, { color: colors.text }])}>{label}</Text>
          {names.length > 0 ? <Text style={StyleSheet.flatten([styles.rowDetail, { color: colors.mutedText }])}>{names.join(', ')}</Text> : null}
        </View>
      </View>
    );
  };

  const typeRow = (row: MapLegendRowData, noneLabel: string, section: string, index: number) => {
    const name = row.Id == null ? noneLabel : asText(row.Name);
    const states = row.States ?? [];
    return (
      <View key={`${section}-${row.Id ?? 'none'}-${index}`} style={StyleSheet.flatten([styles.card, { borderColor: colors.border }])} testID={`map-legend-${section}-${row.Id ?? 'none'}`}>
        <View style={styles.cardHeader}>
          <PinMarkerIcon iconUrl={row.IconUrl} pinIconUrl={row.PinIconUrl} imagePath={row.ImagePath} size={28} accessibilityLabel={name} />
          <Text style={StyleSheet.flatten([styles.rowTitle, styles.cardTitle, { color: colors.text }])}>{name}</Text>
        </View>
        {states.length > 0 ? (
          <View style={styles.states}>
            {states.map((state, stateIndex) => (
              <View key={`${state.Id}-${stateIndex}`} style={styles.state}>
                <PinMarkerIcon iconUrl={state.IconUrl} pinIconUrl={state.PinIconUrl} imagePath={asText(state.ImagePath) || row.ImagePath} size={24} accessibilityLabel={`${name} · ${asText(state.Name)}`} />
                <Text style={StyleSheet.flatten([styles.stateText, { color: colors.mutedText }])} numberOfLines={2}>
                  {asText(state.Name)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const renderBody = () => {
    if (status === 'loading') {
      return (
        <View style={styles.center} testID="map-legend-loading">
          <ActivityIndicator color={colors.primary} />
          <Text style={StyleSheet.flatten([styles.rowDetail, { color: colors.mutedText }])}>{t('maps.legend.loading')}</Text>
        </View>
      );
    }
    if (status === 'error' || !legend) {
      return (
        <View style={styles.center} testID="map-legend-error">
          <Text style={StyleSheet.flatten([styles.rowDetail, { color: colors.text }])}>{t('maps.legend.error')}</Text>
          <SheetButton label={t('common.retry')} onPress={retry} variant="solid" testID="map-legend-retry" />
        </View>
      );
    }
    const personnel = canViewPersonnel ? legend.personnel : [];
    return (
      <View testID="map-legend-content">
        {legend.statusStyles.length > 0 ? heading(t('maps.legend.status_colors'), 'map-legend-heading-status') : null}
        {legend.statusStyles.map((style, index) => styleRow(style, 'status', index))}
        {legend.priorityStyles.length > 0 ? heading(t('maps.legend.priority_colors'), 'map-legend-heading-priority') : null}
        {legend.priorityStyles.map((style, index) => styleRow(style, 'priority', index))}
        {legend.calls.length > 0 ? heading(callsTitle, 'map-legend-heading-calls') : null}
        {legend.calls.map((row, index) => typeRow(row, t('maps.legend.no_call_type'), 'calls', index))}
        {legend.units.length > 0 ? heading(unitsTitle, 'map-legend-heading-units') : null}
        {legend.units.map((row, index) => typeRow(row, t('maps.legend.no_unit_type'), 'units', index))}
        {personnel.length > 0 ? heading(personnelTitle, 'map-legend-heading-personnel') : null}
        {personnel.length > 0 ? <Text style={StyleSheet.flatten([styles.rowDetail, { color: colors.mutedText }])}>{t('maps.legend.personnel_note')}</Text> : null}
        {personnel.map((row, index) => typeRow(row, t('maps.legend.no_role_icon'), 'personnel', index))}
        {heading(t('maps.legend.other'), 'map-legend-heading-other')}
        <View style={StyleSheet.flatten([styles.row, { borderColor: colors.border }])} testID="map-legend-station">
          <PinMarkerIcon imagePath="station" size={28} accessibilityLabel={t('maps.legend.station')} />
          <Text style={StyleSheet.flatten([styles.rowTitle, styles.cardTitle, { color: colors.text }])}>{t('maps.legend.station')}</Text>
        </View>
        {legend.poiTypes.map((poiType) => (
          <View key={`poi-${poiType.PoiTypeId}`} style={StyleSheet.flatten([styles.row, { borderColor: colors.border }])} testID={`map-legend-poi-${poiType.PoiTypeId}`}>
            {poiType.IconUrl ? (
              <PinMarkerIcon iconUrl={poiType.IconUrl} size={28} accessibilityLabel={poiType.Name} />
            ) : (
              <View style={StyleSheet.flatten([styles.poiDot, { backgroundColor: getPoiColor(poiType.Color) }])} accessibilityLabel={poiType.Name} />
            )}
            <Text style={StyleSheet.flatten([styles.rowTitle, styles.cardTitle, { color: colors.text }])}>{poiType.Name}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <MapSheet isOpen={isOpen} onClose={onClose} snapPoints={[80]} testID="map-legend-sheet">
      <SheetHeader title={t('maps.legend.title')} onClose={onClose} closeLabel={t('common.close')} testID="map-legend" />
      {renderBody()}
    </MapSheet>
  );
};

const styles = StyleSheet.create({
  heading: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  swatch: {
    width: 14,
    height: 14,
    marginHorizontal: 10,
    borderRadius: 7,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowDetail: {
    marginTop: 4,
    fontSize: 12,
  },
  card: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    marginLeft: 10,
    flexShrink: 1,
  },
  states: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  state: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 8,
  },
  stateText: {
    marginLeft: 6,
    flexShrink: 1,
    fontSize: 12,
  },
  poiDot: {
    width: 20,
    height: 20,
    marginHorizontal: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  center: {
    alignItems: 'center',
    paddingVertical: 32,
  },
});
