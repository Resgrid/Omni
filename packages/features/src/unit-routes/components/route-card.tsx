import { useTranslation } from '@resgrid/i18n';
import type { RoutePlanResultData } from '@resgrid/models';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { Clock, MapPin, Navigation, Truck } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { formatDistance, formatDuration } from '../lib/route-format';
import { routeColor } from '../lib/route-map';

export interface RouteCardProps {
  route: RoutePlanResultData;
  /** This plan is the unit's running route. */
  isActive?: boolean;
  /** The plan is assigned to this device's unit. */
  isMyUnit?: boolean;
  unitName?: string | null;
  onPress?: (route: RoutePlanResultData) => void;
  testID?: string;
}

const Badge: React.FC<{ label: string; color: string; testID: string }> = ({ label, color, testID }) => (
  <View style={StyleSheet.flatten([styles.badge, { backgroundColor: color }])} testID={testID}>
    <Text className="text-xs font-semibold text-typography-0">{label}</Text>
  </View>
);

/** One route plan (Unit route card): name, description, assigned unit, stop count, planned distance and time. */
export const RouteCard: React.FC<RouteCardProps> = React.memo(({ route, isActive = false, isMyUnit = false, unitName, onPress, testID }) => {
  const { t } = useTranslation();
  const cardTestId = testID ?? `route-card-${route.RoutePlanId}`;
  const border = isMyUnit ? '#3b82f6' : routeColor(route.RouteColor);
  const distance = formatDistance(route.EstimatedDistanceMeters);
  const duration = formatDuration(route.EstimatedDurationSeconds, t);

  return (
    <Pressable
      onPress={onPress ? () => onPress(route) : undefined}
      accessibilityRole="button"
      testID={cardTestId}
      className={`mb-2 rounded-xl p-4 ${isMyUnit ? 'bg-primary-50' : 'bg-background-0'}`}
      style={StyleSheet.flatten([styles.card, { borderLeftColor: border }])}
    >
      <HStack className="items-start">
        <VStack className="flex-1" space="xs">
          <HStack space="sm" className="items-center">
            <View>
              <Navigation size={16} color="#6b7280" />
            </View>
            <Text className="flex-1 text-lg font-bold text-typography-900" numberOfLines={1}>
              {route.Name}
            </Text>
          </HStack>
          {route.Description ? (
            <Text className="text-sm text-typography-600" numberOfLines={2}>
              {route.Description}
            </Text>
          ) : null}
          <HStack space="xs" className="items-center">
            <View>
              <Truck size={12} color={isMyUnit ? '#3b82f6' : '#9ca3af'} />
            </View>
            <Text className={`text-xs font-medium ${isMyUnit ? 'text-primary-600' : 'text-typography-400'}`}>{unitName || t('routes.unassigned')}</Text>
          </HStack>
          <HStack space="md" className="flex-wrap items-center">
            <HStack space="xs" className="items-center">
              <View>
                <MapPin size={12} color="#9ca3af" />
              </View>
              <Text className="text-sm text-typography-500">{t('routes.stop_count', { count: route.StopsCount ?? 0 })}</Text>
            </HStack>
            {distance ? <Text className="text-sm text-typography-500">{distance}</Text> : null}
            {duration ? (
              <HStack space="xs" className="items-center">
                <View>
                  <Clock size={12} color="#9ca3af" />
                </View>
                <Text className="text-sm text-typography-500">{duration}</Text>
              </HStack>
            ) : null}
          </HStack>
        </VStack>
        <VStack space="xs" className="items-end">
          {isActive ? <Badge label={t('routes.active')} color="#22c55e" testID={`${cardTestId}-active`} /> : null}
          {isMyUnit && !isActive ? <Badge label={t('routes.my_unit')} color="#3b82f6" testID={`${cardTestId}-mine`} /> : null}
        </VStack>
      </HStack>
    </Pressable>
  );
});

RouteCard.displayName = 'RouteCard';

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
