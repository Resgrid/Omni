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
}

/** Toggle department GeoJSON layers and jump to the custom/indoor maps (baseline IC map-layers-sheet). */
export const MapLayersSheet: React.FC<MapLayersSheetProps> = ({ isOpen, onClose, layers, toggles, onToggle, onShowDetails, onBrowseMaps, onSearchMaps }) => {
  const { t } = useTranslation();
  const { colors } = useMapTheme();
  const activeCount = layers.filter((layer) => toggles[layer.Id]).length;
  return (
    <MapSheet isOpen={isOpen} onClose={onClose} snapPoints={[70]} testID="map-layers-sheet">
      <SheetHeader title={t('maps.map_layers')} onClose={onClose} closeLabel={t('common.close')} testID="map-layers" />
      {layers.length === 0 ? (
        <Text style={StyleSheet.flatten([styles.empty, { color: colors.mutedText }])} testID="map-layers-empty">
          {t('maps.no_layers')}
        </Text>
      ) : (
        <>
          <Text style={StyleSheet.flatten([styles.count, { color: colors.mutedText }])}>{t('maps.layers_on', { active: activeCount, total: layers.length })}</Text>
          <ScrollView style={styles.list} nestedScrollEnabled={true}>
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
          </ScrollView>
        </>
      )}
      {onBrowseMaps ? <SheetButton label={t('maps.title')} onPress={onBrowseMaps} icon={<Building2 size={18} color={colors.primary} />} testID="browse-maps-button" /> : null}
      {onSearchMaps ? <SheetButton label={t('maps.search_maps')} onPress={onSearchMaps} icon={<Search size={18} color={colors.primary} />} testID="search-maps-button" /> : null}
    </MapSheet>
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
