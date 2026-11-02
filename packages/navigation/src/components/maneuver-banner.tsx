import { useTranslation } from '@resgrid/i18n';
import { HStack, Text, View, VStack } from '@resgrid/ui';
import { ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import type { DistanceUnits } from '../engine/format';
import type { NavBannerState } from '../engine/guidance';
import { ManeuverIcon } from './maneuver-icon';
import { useDistanceText } from './use-distance-text';

export interface ManeuverBannerProps {
  banner: NavBannerState | null;
  units: DistanceUnits;
  /** Shown instead of the maneuver while a new route loads. */
  rerouting?: boolean;
  testID?: string;
}

const laneIconFor = (directions: string[]) => {
  const first = directions[0] ?? 'straight';
  if (first.includes('slight left')) return ArrowUpLeft;
  if (first.includes('left')) return CornerUpLeft;
  if (first.includes('slight right')) return ArrowUpRight;
  if (first.includes('right')) return CornerUpRight;
  return ArrowUp;
};

/**
 * The maneuver banner (MapLibre plan §9.2): arrow, distance to the maneuver, the road or instruction, the next
 * instruction and lanes when the provider sends them. Large type for a vehicle-mounted screen.
 */
export const ManeuverBanner: React.FC<ManeuverBannerProps> = ({ banner, units, rerouting = false, testID = 'navigation-banner' }) => {
  const { t } = useTranslation();
  const distanceText = useDistanceText(units);
  if (rerouting) {
    return (
      <View style={styles.banner} testID={testID} accessibilityRole="header" accessibilityLiveRegion="polite">
        <Text className="text-2xl font-bold text-white">{t('navigation.rerouting')}</Text>
      </View>
    );
  }
  if (!banner) return null;
  const distance = distanceText(banner.distanceToManeuver);
  return (
    <View style={styles.banner} testID={testID} accessibilityRole="header" accessibilityLabel={`${distance}, ${banner.primary.text}`}>
      <HStack className="items-center">
        <View style={styles.icon}>
          <ManeuverIcon type={banner.maneuverType} modifier={banner.modifier} size={48} />
        </View>
        <VStack className="flex-1">
          <Text className="text-3xl font-bold text-white" testID={`${testID}-distance`}>
            {distance}
          </Text>
          <Text className="text-xl font-semibold text-white" numberOfLines={2} testID={`${testID}-primary`}>
            {banner.primary.text}
          </Text>
          {banner.secondary ? (
            <Text className="text-base text-white" numberOfLines={1}>
              {banner.secondary.text}
            </Text>
          ) : null}
        </VStack>
      </HStack>
      {banner.lanes.length > 0 ? (
        <HStack className="mt-2 justify-center" testID={`${testID}-lanes`}>
          {banner.lanes.map((lane, index) => {
            const LaneIcon = laneIconFor(lane.directions);
            return (
              <View key={`lane-${index}`} style={styles.lane}>
                <LaneIcon size={24} color={lane.active ? '#ffffff' : '#64748b'} />
              </View>
            );
          })}
        </HStack>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: { backgroundColor: '#14532d', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  icon: { marginRight: 14 },
  lane: { marginHorizontal: 4 },
});
