import { useTranslation } from '@resgrid/i18n';
import { X } from 'lucide-react-native';
import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMapTheme } from '../provider/context';
import { MapModal } from '../provider/overlays';
import { Camera, MapView, MarkerView } from '../rg';
import { PickerPin } from './location-picker';

export interface FullScreenMapProps {
  isOpen: boolean;
  latitude: number;
  longitude: number;
  onClose: () => void;
  title?: string;
  address?: string;
  zoom?: number;
  /** Extra map content (other pins, route line). */
  children?: ReactNode;
}

/** A location on a full-screen map (baseline Unit full-screen-map; Responder full-screen-map-modal). */
export const FullScreenMap: React.FC<FullScreenMapProps> = ({ isOpen, latitude, longitude, onClose, title, address, zoom = 15, children }) => {
  const { t } = useTranslation();
  const { colors } = useMapTheme();
  const insets = useSafeAreaInsets();
  const markerTitle = title || t('call_detail.call_location');

  return (
    <MapModal visible={isOpen} onRequestClose={onClose} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={true} testID="full-screen-map">
      <View style={styles.container}>
        <MapView style={styles.map} compassEnabled={true} testID="full-screen-map-view">
          <Camera defaultSettings={{ centerCoordinate: [longitude, latitude], zoomLevel: zoom }} centerCoordinate={[longitude, latitude]} zoomLevel={zoom} animationMode="none" />
          <MarkerView id="full-screen-map-location" coordinate={[longitude, latitude]} anchor={{ x: 0.5, y: 1 }}>
            <PickerPin />
          </MarkerView>
          {children}
        </MapView>
        <View style={StyleSheet.flatten([styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.overlay }])}>
          <Text style={StyleSheet.flatten([styles.title, { color: colors.onOverlay }])} numberOfLines={1}>
            {markerTitle}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={12} style={styles.close} testID="full-screen-map-close">
            <View>
              <X size={26} color={colors.onOverlay} />
            </View>
          </Pressable>
        </View>
        {address ? (
          <View style={StyleSheet.flatten([styles.address, { bottom: insets.bottom + 16, backgroundColor: colors.overlay }])}>
            <Text style={{ color: colors.onOverlay }}>{address}</Text>
          </View>
        ) : null}
      </View>
    </MapModal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    flex: 1,
    marginRight: 12,
    fontSize: 17,
    fontWeight: '600',
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  address: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
