import { useTranslation } from '@resgrid/i18n';
import { LocateFixed, MapPin } from 'lucide-react-native';
import React, { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useMapCenter, useMapServices, useMapTheme } from '../provider/context';
import { Camera, MapView, MarkerView } from '../rg';
import type { CameraRef, MapPressEvent } from '../rg/types';
import { SheetButton } from './sheet-parts';

/** Location pickers (baseline Responder location-picker + full-screen picker, Dispatch web pickers): one implementation on every platform. */

export interface PickedLocation {
  latitude: number;
  longitude: number;
  address?: string;
}

const isUsable = (location: PickedLocation | null | undefined): location is PickedLocation =>
  !!location &&
  Number.isFinite(location.latitude) &&
  Number.isFinite(location.longitude) &&
  Math.abs(location.latitude) <= 90 &&
  Math.abs(location.longitude) <= 180 &&
  !(location.latitude === 0 && location.longitude === 0);

export interface PickerState {
  location: PickedLocation | null;
  setLocation: (location: PickedLocation | null) => void;
  /** Asks the app for the device position (`services.getCurrentPosition`) and moves the pin there. */
  locate: () => Promise<void>;
  isLocating: boolean;
}

/**
 * Picker state: the initial location (Null Island counts as none), else — once — the device position. The pin follows a
 * changed `initialLocation` (a search elsewhere on the form moved it).
 */
export const usePickerState = (initialLocation: PickedLocation | null | undefined, autoLocate: boolean): PickerState => {
  const services = useMapServices();
  const [location, setLocation] = useState<PickedLocation | null>(isUsable(initialLocation) ? initialLocation : null);
  const [isLocating, setIsLocating] = useState(false);
  const mounted = useRef(true);
  const attempted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const locate = useCallback(async () => {
    attempted.current = true;
    setIsLocating(true);
    try {
      const position = await services.getCurrentPosition();
      if (mounted.current && position && isUsable(position)) {
        setLocation({ latitude: position.latitude, longitude: position.longitude });
      }
    } catch {
      // No fix / permission denied: the user taps the map instead.
    } finally {
      if (mounted.current) setIsLocating(false);
    }
  }, [services]);

  const initialLat = initialLocation?.latitude;
  const initialLon = initialLocation?.longitude;
  useEffect(() => {
    if (isUsable(initialLocation)) {
      setLocation(initialLocation);
    } else if (autoLocate && !attempted.current) {
      void locate();
    }
    // Follow the coordinates, not the object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLat, initialLon, autoLocate, locate]);

  return { location, setLocation, locate, isLocating };
};

/** The pin drawn at the picked location. */
export const PickerPin: React.FC = () => {
  const { colors } = useMapTheme();
  return (
    <View testID="location-picker-pin">
      <MapPin size={36} color={colors.danger} />
    </View>
  );
};

export interface LocationPickerProps {
  initialLocation?: PickedLocation | null;
  onLocationSelected: (location: PickedLocation) => void;
  height?: number;
  /** Extra map content (Dispatch: the available-resources overlay and its legend). */
  overlay?: ReactNode;
  /** Ask for the device position when there is no initial location (default true). */
  autoLocate?: boolean;
  testID?: string;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({ initialLocation, onLocationSelected, height = 200, overlay, autoLocate = true, testID = 'location-picker' }) => {
  const { t } = useTranslation();
  const { colors } = useMapTheme();
  const center = useMapCenter();
  const cameraRef = useRef<CameraRef>(null);
  const { location, setLocation, locate, isLocating } = usePickerState(initialLocation, autoLocate);

  const handlePress = useCallback((event: MapPressEvent) => setLocation({ latitude: event.coordinates[1], longitude: event.coordinates[0] }), [setLocation]);
  const handleConfirm = useCallback(() => {
    if (location) onLocationSelected({ latitude: location.latitude, longitude: location.longitude, address: location.address });
  }, [location, onLocationSelected]);

  return (
    <View style={StyleSheet.flatten([styles.container, { height, backgroundColor: colors.surface }])} testID={testID}>
      <MapView style={styles.map} onPress={handlePress} compassEnabled={true} testID={`${testID}-map`}>
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: location ? [location.longitude, location.latitude] : [center.longitude, center.latitude], zoomLevel: location ? 15 : center.zoomLevel }}
          centerCoordinate={location ? [location.longitude, location.latitude] : undefined}
          zoomLevel={location ? 15 : undefined}
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
      {!location ? (
        <View style={StyleSheet.flatten([styles.prompt, { backgroundColor: colors.overlay }])} pointerEvents="box-none" testID={`${testID}-prompt`}>
          <Text style={StyleSheet.flatten([styles.promptText, { color: colors.onOverlay }])}>{t('maps.picker.tap_to_select')}</Text>
          <Pressable onPress={() => void locate()} disabled={isLocating} accessibilityRole="button" style={styles.locate} testID={`${testID}-locate`}>
            {isLocating ? (
              <ActivityIndicator color={colors.onOverlay} />
            ) : (
              <View style={styles.row}>
                <View>
                  <LocateFixed size={16} color={colors.onOverlay} />
                </View>
                <Text style={StyleSheet.flatten([styles.locateText, { color: colors.onOverlay }])}>{t('common.get_my_location')}</Text>
              </View>
            )}
          </Pressable>
        </View>
      ) : null}
      <View style={styles.confirm}>
        <SheetButton label={t('common.confirm_location')} onPress={handleConfirm} variant="solid" disabled={!location} testID={`${testID}-confirm`} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
  },
  map: {
    flex: 1,
  },
  prompt: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
  },
  promptText: {
    fontSize: 13,
    textAlign: 'center',
  },
  locate: {
    marginTop: 6,
    padding: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locateText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  confirm: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
  },
});
