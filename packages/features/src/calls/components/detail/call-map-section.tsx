import { isFieldRedacted, ProtectedFieldIds } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { Button, ButtonText, useThemeColors } from '@resgrid/ui';
import { MapPin, Navigation } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useCallFormHookPoints } from '../../hook-points';
import { isUsablePoint } from '../../lib/call-location';

export interface CallMapSectionProps {
  call: CallResultData;
}

const callPoint = (call: CallResultData): { latitude: number; longitude: number } | null => {
  if (isUsablePoint(call.Latitude, call.Longitude)) return { latitude: Number(call.Latitude), longitude: Number(call.Longitude) };
  const [lat, lon] = (call.Geolocation ?? '').split(',');

  return isUsablePoint(lat, lon) ? { latitude: Number(lat), longitude: Number(lon) } : null;
};

/**
 * The call's map (Dispatch call detail; the map itself comes from the app's `StaticLocationMap` hook point): the call
 * location, toggling to the destination POI when the call has one. A withheld address never reaches the map's overlay
 * or accessibility label; a withheld location is not drawn at all.
 */
export const CallMapSection: React.FC<CallMapSectionProps> = ({ call }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { StaticLocationMap } = useCallFormHookPoints();
  const [view, setView] = useState<'call' | 'destination'>('call');
  const locationWithheld = isFieldRedacted(call.RedactedFields, ProtectedFieldIds.callGeolocation, call.Geolocation);
  const point = locationWithheld ? null : callPoint(call);
  const hasDestination = isUsablePoint(call.DestinationLatitude, call.DestinationLongitude);
  // Without a usable call point the destination is all there is to show.
  const showDestination = hasDestination && (view === 'destination' || !point);
  const addressWithheld = isFieldRedacted(call.RedactedFields, ProtectedFieldIds.callAddress, call.Address);
  const latitude = showDestination ? Number(call.DestinationLatitude) : point?.latitude;
  const longitude = showDestination ? Number(call.DestinationLongitude) : point?.longitude;
  const address = showDestination ? call.DestinationAddress || call.DestinationName : addressWithheld ? undefined : call.Address;

  if (!StaticLocationMap || (!point && !hasDestination)) return null;

  return (
    <View style={styles.card} className="bg-background-0" testID="call-detail-map">
      {hasDestination ? (
        <View style={styles.toggle}>
          {(
            [
              ['call', 'call_detail.map_call', MapPin],
              ['destination', 'call_detail.map_destination', Navigation],
            ] as const
          ).map(([key, label, Icon]) => (
            <Button
              key={key}
              variant={(key === 'destination') === showDestination ? 'solid' : 'outline'}
              size="sm"
              className="mx-1 flex-1"
              onPress={() => setView(key)}
              accessibilityLabel={t(label)}
              accessibilityState={{ selected: (key === 'destination') === showDestination }}
              testID={`call-detail-map-${key}`}
            >
              <View style={styles.buttonIcon}>
                <Icon size={16} color={(key === 'destination') === showDestination ? colors.textInverse : colors.primary} />
              </View>
              <ButtonText>{t(label)}</ButtonText>
            </Button>
          ))}
        </View>
      ) : null}
      {latitude !== undefined && longitude !== undefined ? <StaticLocationMap latitude={latitude} longitude={longitude} address={address || undefined} height={200} testID="call-detail-static-map" /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  toggle: { flexDirection: 'row', padding: 8 },
  buttonIcon: { marginRight: 4 },
});
