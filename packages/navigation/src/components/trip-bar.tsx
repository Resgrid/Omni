import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { ExternalLink, Locate, Map as MapIcon, Volume2, VolumeX, X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { type DistanceUnits, minutesRemaining } from '../engine/format';
import { useDistanceText } from './use-distance-text';

export interface TripBarProps {
  /** Epoch ms of arrival at the leg being driven to. */
  etaAt: number | null;
  durationSeconds: number;
  distanceMeters: number;
  units: DistanceUnits;
  isTrafficAware: boolean;
  muted: boolean;
  /** True while the camera follows the vehicle (shows Overview), false after a pan or in overview (shows Recenter). */
  following: boolean;
  onToggleMute: () => void;
  onOverview: () => void;
  onRecenter: () => void;
  onEnd: () => void;
  /** "Open in…" another navigation app; hidden when absent. */
  onOpenExternal?: () => void;
  testID?: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

interface BarButtonProps {
  label: string;
  onPress: () => void;
  testID: string;
  children: React.ReactNode;
  danger?: boolean;
}

/** Large touch targets (§9.3 safety): at least 56 pt. */
const BarButton: React.FC<BarButtonProps> = ({ label, onPress, testID, children, danger = false }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={StyleSheet.flatten([styles.button, danger ? styles.danger : null])}>
    {children}
  </Pressable>
);

/** Arrival time, minutes and distance left, and the session controls (mute, overview / recenter, open in…, end). */
export const TripBar: React.FC<TripBarProps> = ({
  etaAt,
  durationSeconds,
  distanceMeters,
  units,
  isTrafficAware,
  muted,
  following,
  onToggleMute,
  onOverview,
  onRecenter,
  onEnd,
  onOpenExternal,
  testID = 'navigation-trip-bar',
}) => {
  const { t } = useTranslation();
  const distanceText = useDistanceText(units);
  const eta = etaAt !== null ? new Date(etaAt) : null;
  const minutes = minutesRemaining(durationSeconds);
  return (
    <View style={styles.bar} testID={testID}>
      <HStack className="items-center">
        <VStack className="flex-1">
          <Text className="text-2xl font-bold" testID={`${testID}-eta`}>
            {eta ? t('navigation.arrival_time', { time: `${pad(eta.getHours())}:${pad(eta.getMinutes())}` }) : '—'}
          </Text>
          <Text className="text-base text-typography-600" testID={`${testID}-remaining`}>
            {t('navigation.remaining', { minutes: t('navigation.minutes', { count: minutes }), distance: distanceText(distanceMeters) })}
            {isTrafficAware ? ` · ${t('navigation.traffic_aware')}` : ''}
          </Text>
        </VStack>
        <HStack>
          <BarButton label={muted ? t('navigation.unmute') : t('navigation.mute')} onPress={onToggleMute} testID={`${testID}-mute`}>
            {muted ? <VolumeX size={26} color="#111827" /> : <Volume2 size={26} color="#111827" />}
          </BarButton>
          {following ? (
            <BarButton label={t('navigation.overview')} onPress={onOverview} testID={`${testID}-overview`}>
              <MapIcon size={26} color="#111827" />
            </BarButton>
          ) : (
            <BarButton label={t('navigation.recenter')} onPress={onRecenter} testID={`${testID}-recenter`}>
              <Locate size={26} color="#111827" />
            </BarButton>
          )}
          {onOpenExternal ? (
            <BarButton label={t('navigation.open_external')} onPress={onOpenExternal} testID={`${testID}-external`}>
              <ExternalLink size={26} color="#111827" />
            </BarButton>
          ) : null}
          <BarButton label={t('navigation.end')} onPress={onEnd} testID={`${testID}-end`} danger={true}>
            <X size={26} color="#ffffff" />
          </BarButton>
        </HStack>
      </HStack>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  button: { alignItems: 'center', backgroundColor: '#e5e7eb', borderRadius: 28, height: 56, justifyContent: 'center', marginLeft: 8, width: 56 },
  danger: { backgroundColor: '#dc2626' },
});
