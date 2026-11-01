import { useTranslation } from '@resgrid/i18n';
import React, { useCallback, useState } from 'react';
import { Image, type LayoutChangeEvent, PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';

import { fillStaticMapTemplate } from '../lib/static-map';
import { useMapProviderContext } from '../provider/context';
import { Camera, MapView, MarkerView, UserLocation } from '../rg';
import { PickerPin } from './location-picker';

export interface StaticMapProps {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  address?: string | null;
  zoom?: number;
  height?: number;
  showUserLocation?: boolean;
  /** Tap (e.g. open the full-screen map). */
  onPress?: () => void;
  testID?: string;
}

const hasLocation = (latitude: number | null | undefined, longitude: number | null | undefined): boolean =>
  typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0);

/**
 * A location thumbnail (baseline IC static-map). With the server's `StaticMapUrlTemplate` it is a plain image
 * (`Mapping/GetStaticMap`, §6.6) — no GL context per card. Without it, a non-interactive MapView with a pin.
 */
export const StaticMap: React.FC<StaticMapProps> = ({ latitude, longitude, address, zoom = 15, height = 200, showUserLocation = false, onPress, testID = 'static-map' }) => {
  const { t } = useTranslation();
  const { staticMapUrlTemplate, scheme, theme } = useMapProviderContext();
  const [width, setWidth] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width), []);

  if (!hasLocation(latitude, longitude) || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return (
      <View style={StyleSheet.flatten([styles.container, styles.center, { height, backgroundColor: theme.surface }])} testID={`${testID}-empty`}>
        <Text style={{ color: theme.mutedText }}>{t('call_detail.no_location')}</Text>
      </View>
    );
  }

  const imageUrl = staticMapUrlTemplate && width > 0 ? fillStaticMapTemplate(staticMapUrlTemplate, { latitude, longitude, zoom, width, height, scale: PixelRatio.get(), scheme }) : null;

  const content = staticMapUrlTemplate ? (
    imageUrl ? (
      <Image source={{ uri: imageUrl }} style={StyleSheet.flatten([styles.image, { height }])} resizeMode="cover" accessibilityLabel={address ?? t('call_detail.call_location')} testID={`${testID}-image`} />
    ) : null
  ) : (
    <MapView style={styles.map} interactive={false} testID={`${testID}-map`}>
      <Camera defaultSettings={{ centerCoordinate: [longitude, latitude], zoomLevel: zoom }} centerCoordinate={[longitude, latitude]} zoomLevel={zoom} animationMode="none" />
      <MarkerView id="static-map-location" coordinate={[longitude, latitude]} anchor={{ x: 0.5, y: 1 }}>
        <PickerPin />
      </MarkerView>
      {showUserLocation ? <UserLocation visible={true} /> : null}
    </MapView>
  );

  return (
    <View onLayout={handleLayout} style={StyleSheet.flatten([styles.container, { height, backgroundColor: theme.surface }])} testID={testID}>
      {content}
      {address ? (
        <View style={styles.address} pointerEvents="none">
          <Text style={styles.addressText} numberOfLines={2}>
            {address}
          </Text>
        </View>
      ) : null}
      {onPress ? <Pressable onPress={onPress} style={styles.press} accessibilityRole="button" accessibilityLabel={address ?? t('call_detail.call_location')} testID={`${testID}-press`} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    flex: 1,
  },
  image: {
    width: '100%',
  },
  address: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  press: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  addressText: {
    color: '#ffffff',
    fontSize: 12,
  },
});
