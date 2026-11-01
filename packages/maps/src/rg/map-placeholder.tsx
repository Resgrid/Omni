import { useTranslation } from '@resgrid/i18n';
import React, { type ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useMapProviderContext } from '../provider/context';

interface MapPlaceholderProps {
  status: 'loading' | 'none' | 'error';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  fallback?: ReactNode;
}

/**
 * What a `MapView` shows instead of a map: an empty frame while the style loads, and a quiet "map unavailable" panel
 * when the department has no usable style (maps are hidden, not broken — MapLibre plan §8.1).
 */
export const MapPlaceholder: React.FC<MapPlaceholderProps> = ({ status, style, testID, fallback }) => {
  const { t } = useTranslation();
  const { theme } = useMapProviderContext();
  if (status === 'loading') {
    return <View style={StyleSheet.flatten([styles.frame, { backgroundColor: theme.surface }, style])} testID={testID ? `${testID}-loading` : 'map-loading'} />;
  }
  if (fallback !== undefined) {
    return <>{fallback}</>;
  }
  return (
    <View style={StyleSheet.flatten([styles.frame, styles.center, { backgroundColor: theme.surface }, style])} testID={testID ? `${testID}-unavailable` : 'map-unavailable'} accessibilityRole="text">
      <Text style={StyleSheet.flatten([styles.text, { color: theme.mutedText }])}>{status === 'error' ? t('maps.error_loading') : t('maps.unavailable')}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    minHeight: 100,
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  text: {
    fontSize: 14,
    textAlign: 'center',
  },
});
