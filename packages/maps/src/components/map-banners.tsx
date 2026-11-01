import { useTranslation } from '@resgrid/i18n';
import { LocateFixed } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMapTheme } from '../provider/context';

export interface MapFocusBannerProps {
  /** What the map is framed on (e.g. the selected unit). */
  title: string;
  /** How much of it has a position ("2 of 4 crew located"), composed by the feature. */
  detail?: string | null;
  /** Re-frame after the user moved the map; omitted → no button. */
  onRecenter?: () => void;
  recenterLabel?: string;
}

/** Floating banner naming what the map is focused on (generalized from Dispatch map-focus-banner). */
export const MapFocusBanner: React.FC<MapFocusBannerProps> = ({ title, detail, onRecenter, recenterLabel }) => {
  const { t } = useTranslation();
  const { colors } = useMapTheme();
  return (
    <View style={StyleSheet.flatten([styles.banner, { backgroundColor: colors.background, borderColor: colors.border }])} testID="map-focus-banner" pointerEvents="box-none">
      <View style={styles.text}>
        <Text style={StyleSheet.flatten([styles.title, { color: colors.text }])} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text style={StyleSheet.flatten([styles.detail, { color: colors.mutedText }])} numberOfLines={2} testID="map-focus-banner-detail">
            {detail}
          </Text>
        ) : null}
      </View>
      {onRecenter ? (
        <Pressable onPress={onRecenter} style={styles.recenter} accessibilityRole="button" accessibilityLabel={recenterLabel ?? t('map.recenter_map')} testID="map-focus-recenter">
          <View>
            <LocateFixed size={18} color={colors.primary} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
};

export interface MapOverlayLegendItem {
  key: string;
  label: string;
  color: string;
  /** `dot` (larger circle), `small-dot`, or `outline` (boundary). */
  kind: 'dot' | 'small-dot' | 'outline';
}

/** A compact key for an overlay drawn on a map (generalized from Dispatch dispatch-map-legend); same on native and web. */
export const MapOverlayLegend: React.FC<{ items: readonly MapOverlayLegendItem[]; testID?: string }> = ({ items, testID = 'map-overlay-legend' }) => {
  const { colors } = useMapTheme();
  if (items.length === 0) return null;
  return (
    <View style={StyleSheet.flatten([styles.legend, { backgroundColor: colors.overlay }])} pointerEvents="none" testID={testID}>
      {items.map((item) => (
        <View key={item.key} style={styles.item}>
          <View
            style={item.kind === 'outline' ? StyleSheet.flatten([styles.outline, { borderColor: item.color }]) : StyleSheet.flatten([item.kind === 'dot' ? styles.dot : styles.smallDot, { backgroundColor: item.color }])}
          />
          <Text style={StyleSheet.flatten([styles.label, { color: colors.onOverlay }])}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 8,
    left: 8,
    maxWidth: 280,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 4,
    borderRadius: 8,
    borderWidth: 1,
    zIndex: 10,
  },
  text: {
    flexShrink: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  detail: {
    fontSize: 11,
  },
  recenter: {
    marginLeft: 6,
    padding: 6,
  },
  legend: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  dot: {
    width: 12,
    height: 12,
    marginRight: 6,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  smallDot: {
    width: 9,
    height: 9,
    marginRight: 6,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  outline: {
    width: 12,
    height: 9,
    marginRight: 6,
    borderWidth: 2,
    borderRadius: 2,
  },
  label: {
    fontSize: 11,
  },
});
