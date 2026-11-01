import { useTranslation } from '@resgrid/i18n';
import { LocateFixed } from 'lucide-react-native';
import React, { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMapCenter, useMapServices, useMapTheme } from '../provider/context';
import { MapModal } from '../provider/overlays';
import { Camera, MapView, MarkerView } from '../rg';
import type { MapPressEvent } from '../rg/types';
import { type PickedLocation, PickerPin, usePickerState } from './location-picker';
import { SheetButton, SheetHeader } from './sheet-parts';

export interface FullScreenLocationPickerProps {
  isOpen: boolean;
  initialLocation?: PickedLocation | null;
  onLocationSelected: (location: PickedLocation) => void;
  onClose: () => void;
  overlay?: ReactNode;
  /** Look the address up through the server for the picked point (default true). */
  reverseGeocode?: boolean;
  title?: string;
}

/**
 * Full-screen picker: tap to move the pin, "my location", and the address of the picked point from the server
 * (`Geocoding/ReverseGeocode` — never a provider called from the app; replaces Dispatch web's direct Mapbox call).
 */
export const FullScreenLocationPicker: React.FC<FullScreenLocationPickerProps> = ({ isOpen, initialLocation, onLocationSelected, onClose, overlay, reverseGeocode = true, title }) => {
  const { t } = useTranslation();
  const { colors } = useMapTheme();
  const insets = useSafeAreaInsets();
  const center = useMapCenter();
  const services = useMapServices();
  const { location, setLocation, locate, isLocating } = usePickerState(initialLocation, isOpen);
  const [address, setAddress] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const latitude = location?.latitude;
  const longitude = location?.longitude;
  useEffect(() => {
    if (!reverseGeocode || latitude === undefined || longitude === undefined) {
      setAddress(null);
      return undefined;
    }
    const controller = new AbortController();
    setIsLookingUp(true);
    services
      .reverseGeocode(latitude, longitude, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setAddress(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAddress(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLookingUp(false);
      });
    return () => controller.abort();
  }, [latitude, longitude, reverseGeocode, services]);

  const handlePress = useCallback((event: MapPressEvent) => setLocation({ latitude: event.coordinates[1], longitude: event.coordinates[0] }), [setLocation]);
  const handleConfirm = useCallback(() => {
    if (!location) return;
    onLocationSelected({ latitude: location.latitude, longitude: location.longitude, address: address ?? undefined });
    onClose();
  }, [location, address, onLocationSelected, onClose]);

  return (
    <MapModal visible={isOpen} onRequestClose={onClose} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={true} testID="full-screen-location-picker">
      <View style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}>
        <MapView style={styles.map} onPress={handlePress} compassEnabled={true} testID="full-screen-location-picker-map">
          <Camera
            defaultSettings={{ centerCoordinate: location ? [location.longitude, location.latitude] : [center.longitude, center.latitude], zoomLevel: location ? 15 : center.zoomLevel }}
            centerCoordinate={location ? [location.longitude, location.latitude] : undefined}
            animationMode="easeTo"
            animationDuration={600}
          />
          {location ? (
            <MarkerView id="picked-location" coordinate={[location.longitude, location.latitude]} anchor={{ x: 0.5, y: 1 }}>
              <PickerPin />
            </MarkerView>
          ) : null}
          {overlay}
        </MapView>
        <View style={StyleSheet.flatten([styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background }])}>
          <SheetHeader title={title ?? t('calls.select_location')} onClose={onClose} closeLabel={t('common.close')} testID="full-screen-location-picker" />
        </View>
        <Pressable
          onPress={() => void locate()}
          disabled={isLocating}
          accessibilityRole="button"
          accessibilityLabel={t('common.my_location')}
          style={StyleSheet.flatten([styles.locate, { top: insets.top + 72, backgroundColor: colors.primary }])}
          testID="full-screen-location-picker-locate"
        >
          {isLocating ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <View>
              <LocateFixed size={20} color={colors.onPrimary} />
            </View>
          )}
        </Pressable>
        <View style={StyleSheet.flatten([styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderColor: colors.border }])}>
          <Text style={StyleSheet.flatten([styles.address, { color: colors.mutedText }])} numberOfLines={2} testID="full-screen-location-picker-address">
            {location ? (isLookingUp ? t('maps.picker.looking_up_address') : (address ?? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`)) : t('maps.picker.tap_to_select')}
          </Text>
          <SheetButton label={t('common.confirm_location')} onPress={handleConfirm} variant="solid" disabled={!location} testID="full-screen-location-picker-confirm" />
        </View>
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
    paddingHorizontal: 16,
  },
  locate: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  address: {
    fontSize: 14,
  },
});
