import { useTranslation } from '@resgrid/i18n';
import { Camera, MapView, MarkerView } from '@resgrid/maps';
import { ScreenHeader, View, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { parseCoordinates } from '../lib/board';
import { safeColor } from '../lib/labels';

const first = (value?: string | string[]): string | undefined => (Array.isArray(value) ? value[0] : value);

export interface ResourceMapScreenProps {
  latitude?: number;
  longitude?: number;
  title?: string;
  color?: string;
}

/** One resource's last known position (`/resource-map?latitude&longitude&title&color`, IC). Bad or missing coordinates show a message. */
export default function ResourceMapScreen(props: ResourceMapScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ latitude?: string | string[]; longitude?: string | string[]; title?: string | string[]; color?: string | string[] }>();
  const position = parseCoordinates(props.latitude ?? first(params.latitude), props.longitude ?? first(params.longitude));
  const title = props.title ?? first(params.title) ?? t('incident_command.resource_map');
  // Route params are untrusted: only a hex colour is used.
  const color = safeColor(props.color ?? first(params.color), '#e53e3e');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/command' as never));

  return (
    <View className="flex-1" testID="resource-map-screen">
      <ScreenHeader title={title} onBack={back} />
      {position ? (
        <MapView style={styles.map} compassEnabled testID="resource-map-view">
          <Camera defaultSettings={{ centerCoordinate: [position.longitude, position.latitude], zoomLevel: 15 }} />
          <MarkerView id="resource-position" coordinate={[position.longitude, position.latitude]} anchor={{ x: 0.5, y: 1 }} testID="resource-map-marker">
            <View style={styles.marker}>
              <View style={StyleSheet.flatten([styles.pin, { backgroundColor: color }])} />
              <View style={StyleSheet.flatten([styles.tip, { borderTopColor: color }])} />
            </View>
          </MarkerView>
        </MapView>
      ) : (
        <ZeroState icon={MapPin} heading={t('incident_command.position_unknown')} testID="resource-map-unknown" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  marker: { alignItems: 'center', justifyContent: 'center', width: 30, height: 40 },
  pin: { width: 24, height: 24, borderRadius: 12, borderWidth: 3, borderColor: '#ffffff' },
  tip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -2 },
});
