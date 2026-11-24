import { useTranslation } from '@resgrid/i18n';
import { Building2, Car, Info, Layers, LocateFixed, type LucideIcon, Search } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMapTheme, useMapTraffic } from '../provider/context';
import { MapSheet } from '../provider/overlays';
import { SheetButton, SheetHeader } from './sheet-parts';

export interface MapControlButtonProps {
  icon: LucideIcon;
  accessibilityLabel: string;
  onPress: () => void;
  /** Distance from the bottom safe-area edge, so several round controls can stack. */
  bottomOffset?: number;
  side?: 'left' | 'right';
  active?: boolean;
  testID?: string;
}

/** Round floating map control (baseline IC map-legend-button; same look as the layers / recenter buttons). */
export const MapControlButton: React.FC<MapControlButtonProps> = ({ icon: Icon, accessibilityLabel, onPress, bottomOffset = 20, side = 'right', active = false, testID }) => {
  const { colors, isDark } = useMapTheme();
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={StyleSheet.flatten([
        styles.button,
        side === 'right' ? styles.right : styles.left,
        { bottom: bottomOffset + insets.bottom, backgroundColor: active ? colors.text : colors.primary, shadowColor: isDark ? '#ffffff' : '#000000', shadowOpacity: isDark ? 0.1 : 0.25 },
      ])}
      testID={testID}
    >
      <View>
        <Icon size={20} color={colors.onPrimary} />
      </View>
    </Pressable>
  );
};

export const MapLegendButton: React.FC<Omit<MapControlButtonProps, 'icon' | 'accessibilityLabel'>> = ({ testID = 'map-legend-button', ...props }) => {
  const { t } = useTranslation();

  return <MapControlButton icon={Info} accessibilityLabel={t('maps.legend.title')} testID={testID} {...props} />;
};

export const MapLayersButton: React.FC<Omit<MapControlButtonProps, 'icon' | 'accessibilityLabel'>> = ({ testID = 'map-layers-button', ...props }) => {
  const { t } = useTranslation();

  return <MapControlButton icon={Layers} accessibilityLabel={t('maps.map_layers')} testID={testID} {...props} />;
};

export const MapRecenterButton: React.FC<Omit<MapControlButtonProps, 'icon' | 'accessibilityLabel'>> = ({ testID = 'map-recenter-button', ...props }) => {
  const { t } = useTranslation();

  return <MapControlButton icon={LocateFixed} accessibilityLabel={t('map.recenter_map')} testID={testID} {...props} />;
};

export interface MapTrafficButtonProps extends Omit<MapControlButtonProps, 'icon' | 'accessibilityLabel' | 'active'> {
  /** Whether the traffic overlay is shown (the caller keeps the choice, e.g. remembered per device). */
  isOn: boolean;
}

/** Live traffic on/off (§11.1). Renders nothing when the server has no traffic or the map is offline. */
export const MapTrafficButton: React.FC<MapTrafficButtonProps> = ({ isOn, testID = 'map-traffic-button', ...props }) => {
  const { t } = useTranslation();
  const { available } = useMapTraffic();

  return available ? <MapControlButton icon={Car} accessibilityLabel={t('maps.traffic')} active={isOn} testID={testID} {...props} /> : null;
};

/** A small pill after a layer's name (an event layer's phase): `primary` filled, `outline` outlined, `muted` greyed. */
export interface MapLayerBadge {
  label: string;
  tone: 'primary' | 'outline' | 'muted';
}

export interface MapLayerToggleItem {
  Id: string;
  Name: string;
  Color?: string | null;
  /** A second line under the name (an event layer's dates). */
  Detail?: string | null;
  Badge?: MapLayerBadge | null;
  /** The row gets a details button (with `onShowDetails`). */
  HasDetails?: boolean;
}

/** A floor of an indoor map or a layer of a custom map, for the Layers sheet's facility map chooser. */
export interface MapFacilityLevel {
  Id: string;
  Name: string;
}

/** One of the department's custom or indoor maps in the Layers sheet's facility maps section. */
export interface MapFacilityItem {
  Id: string;
  Name: string;
  /** What kind of map it is (indoor, outdoor, event…), shown under the name. */
  TypeLabel?: string | null;
  /** Its floors or layers once read; the chooser shows while the map is on and has two or more. */
  Levels?: readonly MapFacilityLevel[];
  /** The chosen floor or layer; null = the map's default (an indoor map's default floor, every layer of a custom map). */
  LevelId?: string | null;
  /** The label of the "every layer" choice (custom maps); none for indoor maps, which show one floor at a time. */
  AllLevelsLabel?: string | null;
}

/** The facility maps section of the Layers sheet: the department's custom and indoor maps, each on or off. */
export interface MapFacilitySectionProps {
  items: readonly MapFacilityItem[];
  /** Map id → shown on the map. */
  toggles: Readonly<Record<string, boolean>>;
  onToggle: (id: string) => void;
  /** A floor or layer was chosen (null: the map's default). */
  onSelectLevel: (id: string, levelId: string | null) => void;
}

export interface MapLayersSheetProps {
  isOpen: boolean;
  onClose: () => void;
  layers: readonly MapLayerToggleItem[];
  toggles: Readonly<Record<string, boolean>>;
  onToggle: (layerId: string) => void;
  /** A row's details button was pressed (rows with `HasDetails`). */
  onShowDetails?: (layerId: string) => void;
  /** Shown when the variant has `maps.customIndoor`: open the custom/indoor maps browser and search. */
  onBrowseMaps?: () => void;
  onSearchMaps?: () => void;
  /** The department's custom and indoor maps, drawn over the map when switched on (every map surface, every app). */
  facilityMaps?: MapFacilitySectionProps;
}

/**
 * Toggle department GeoJSON layers and the department's facility maps (custom and indoor maps, with a floor or layer
 * chooser), and jump to the custom/indoor maps browser (baseline IC map-layers-sheet).
 */
export const MapLayersSheet: React.FC<MapLayersSheetProps> = ({ isOpen, onClose, layers, toggles, onToggle, onShowDetails, onBrowseMaps, onSearchMaps, facilityMaps }) => {
  const { t } = useTranslation();
  const { colors } = useMapTheme();
  const activeCount = layers.filter((layer) => toggles[layer.Id]).length;
  const facilityItems = facilityMaps?.items ?? [];

  return (
    <MapSheet isOpen={isOpen} onClose={onClose} snapPoints={[70]} testID="map-layers-sheet">
      <SheetHeader title={t('maps.map_layers')} onClose={onClose} closeLabel={t('common.close')} testID="map-layers" />
      {layers.length === 0 && facilityItems.length === 0 ? (
        <Text style={StyleSheet.flatten([styles.empty, { color: colors.mutedText }])} testID="map-layers-empty">
          {t('maps.no_layers')}
        </Text>
      ) : (
        <>
          {layers.length > 0 ? <Text style={StyleSheet.flatten([styles.count, { color: colors.mutedText }])}>{t('maps.layers_on', { active: activeCount, total: layers.length })}</Text> : null}
          <ScrollView style={facilityItems.length > 0 ? styles.longList : styles.list} nestedScrollEnabled={true}>
            {layers.map((layer) => (
              <View key={layer.Id} style={StyleSheet.flatten([styles.row, { backgroundColor: colors.surface }])} testID={`layer-row-${layer.Id}`}>
                {layer.Color ? <View style={StyleSheet.flatten([styles.dot, { backgroundColor: layer.Color }])} /> : null}
                <View style={styles.label}>
                  <View style={styles.nameLine}>
                    <Text style={StyleSheet.flatten([styles.name, { color: colors.text }])}>{layer.Name}</Text>
                    {layer.Badge ? <LayerBadge badge={layer.Badge} testID={`layer-badge-${layer.Id}`} /> : null}
                  </View>
                  {layer.Detail ? (
                    <Text style={StyleSheet.flatten([styles.detail, { color: colors.mutedText }])} testID={`layer-detail-${layer.Id}`}>
                      {layer.Detail}
                    </Text>
                  ) : null}
                </View>
                {layer.HasDetails && onShowDetails ? (
                  <Pressable
                    onPress={() => onShowDetails(layer.Id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('maps.layer_info.show_details', { name: layer.Name })}
                    hitSlop={8}
                    style={styles.detailsButton}
                    testID={`layer-details-${layer.Id}`}
                  >
                    <View>
                      <Info size={20} color={colors.primary} />
                    </View>
                  </Pressable>
                ) : null}
                <Switch value={!!toggles[layer.Id]} onValueChange={() => onToggle(layer.Id)} accessibilityLabel={layer.Name} testID={`layer-toggle-${layer.Id}`} />
              </View>
            ))}
            {facilityMaps && facilityItems.length > 0 ? <FacilityMapsSection {...facilityMaps} /> : null}
          </ScrollView>
        </>
      )}
      {onBrowseMaps ? <SheetButton label={t('maps.title')} onPress={onBrowseMaps} icon={<Building2 size={18} color={colors.primary} />} testID="browse-maps-button" /> : null}
      {onSearchMaps ? <SheetButton label={t('maps.search_maps')} onPress={onSearchMaps} icon={<Search size={18} color={colors.primary} />} testID="search-maps-button" /> : null}
    </MapSheet>
  );
};

/** The Layers sheet's facility maps: each map on or off and, while on, its floor or layer. */
const FacilityMapsSection: React.FC<MapFacilitySectionProps> = ({ items, toggles, onToggle, onSelectLevel }) => {
  const { t } = useTranslation();
  const { colors } = useMapTheme();

  return (
    <View style={styles.facilitySection} testID="facility-maps-section">
      <Text style={StyleSheet.flatten([styles.sectionTitle, { color: colors.mutedText }])} accessibilityRole="header">
        {t('maps.facility.title')}
      </Text>
      {items.map((item) => {
        const isOn = !!toggles[item.Id];
        const levels = item.Levels ?? [];
        // Without an "every layer" choice the map shows one level: the chosen one, else its first (the default floor).
        const shownLevelId = item.LevelId ?? (item.AllLevelsLabel ? null : (levels[0]?.Id ?? null));

        return (
          <View key={item.Id} style={StyleSheet.flatten([styles.facilityRow, { backgroundColor: colors.surface }])} testID={`facility-row-${item.Id}`}>
            <View style={styles.facilityLine}>
              <View style={styles.label}>
                <Text style={StyleSheet.flatten([styles.name, { color: colors.text }])}>{item.Name}</Text>
                {item.TypeLabel ? <Text style={StyleSheet.flatten([styles.detail, { color: colors.mutedText }])}>{item.TypeLabel}</Text> : null}
              </View>
              <Switch value={isOn} onValueChange={() => onToggle(item.Id)} accessibilityLabel={item.Name} testID={`facility-toggle-${item.Id}`} />
            </View>
            {isOn && levels.length > 1 ? (
              <View style={styles.levels} accessibilityLabel={t('maps.facility.choose_level', { name: item.Name })} testID={`facility-levels-${item.Id}`}>
                {item.AllLevelsLabel ? <LevelChip label={item.AllLevelsLabel} selected={shownLevelId === null} onPress={() => onSelectLevel(item.Id, null)} testID={`facility-level-${item.Id}-all`} /> : null}
                {levels.map((level) => (
                  <LevelChip key={level.Id} label={level.Name} selected={shownLevelId === level.Id} onPress={() => onSelectLevel(item.Id, level.Id)} testID={`facility-level-${item.Id}-${level.Id}`} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const LevelChip: React.FC<{ label: string; selected: boolean; onPress: () => void; testID?: string }> = ({ label, selected, onPress, testID }) => {
  const { colors } = useMapTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={StyleSheet.flatten([styles.chip, { backgroundColor: selected ? colors.primary : 'transparent', borderColor: selected ? colors.primary : colors.border }])}
      testID={testID}
    >
      <Text style={StyleSheet.flatten([styles.chipText, { color: selected ? colors.onPrimary : colors.text }])}>{label}</Text>
    </Pressable>
  );
};

const LayerBadge: React.FC<{ badge: MapLayerBadge; testID?: string }> = ({ badge, testID }) => {
  const { colors } = useMapTheme();
  const filled = badge.tone === 'primary';
  const accent = badge.tone === 'muted' ? colors.mutedText : colors.primary;

  return (
    <View style={StyleSheet.flatten([styles.badge, { backgroundColor: filled ? colors.primary : 'transparent', borderColor: badge.tone === 'muted' ? colors.border : colors.primary }])} testID={testID}>
      <Text style={StyleSheet.flatten([styles.badgeText, { color: filled ? colors.onPrimary : accent }])}>{badge.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3.84,
  },
  right: {
    right: 20,
  },
  left: {
    left: 20,
  },
  empty: {
    paddingVertical: 8,
    textAlign: 'center',
  },
  count: {
    marginBottom: 8,
    fontSize: 13,
  },
  list: {
    maxHeight: 260,
  },
  longList: {
    maxHeight: 380,
  },
  facilitySection: {
    marginTop: 8,
  },
  sectionTitle: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  facilityRow: {
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  facilityLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  chip: {
    marginRight: 6,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  dot: {
    width: 12,
    height: 12,
    marginRight: 8,
    borderRadius: 6,
  },
  label: {
    flex: 1,
  },
  nameLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  name: {
    flexShrink: 1,
    marginRight: 6,
    fontSize: 15,
  },
  detail: {
    marginTop: 2,
    fontSize: 12,
  },
  detailsButton: {
    paddingHorizontal: 8,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
