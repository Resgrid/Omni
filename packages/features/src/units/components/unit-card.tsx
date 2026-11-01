import { CurrentStatusBadge } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { type UnitInfoResultData } from '@resgrid/models';
import { HStack, Pressable, Text, TypeIcon, View, VStack } from '@resgrid/ui';
import { Building2, MapPin, Truck } from 'lucide-react-native';
import React from 'react';

export interface UnitCardProps {
  unit: UnitInfoResultData;
  onPress?: (unit: UnitInfoResultData) => void;
  /** A status for this unit is queued on the device (not yet synced). */
  hasPendingStatus?: boolean;
}

/** A unit row (Responder card + Unit's unit-type icon): type icon, name, type, group, current status and destination. */
export const UnitCard: React.FC<UnitCardProps> = React.memo(({ unit, onPress, hasPendingStatus = false }) => {
  const { t } = useTranslation();
  return (
    <Pressable
      testID={`unit-card-${unit.UnitId}`}
      onPress={onPress ? () => onPress(unit) : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className="mb-2 rounded-xl border border-outline-200 bg-background-0 p-3"
    >
      <HStack space="md" className="items-center">
        <View className="size-11 items-center justify-center rounded-full bg-background-100">
          <TypeIcon iconUrl={unit.TypeIconUrl ?? null} mapIcon={unit.TypeMapIcon ?? null} size={28} fallback={<Truck size={22} color="#6b7280" />} />
        </View>
        <VStack className="flex-1" space="xs">
          <HStack className="items-center justify-between" space="sm">
            <Text className="flex-1 text-base font-semibold text-typography-900" numberOfLines={1}>
              {unit.Name}
            </Text>
            {unit.Type ? <Text className="text-xs text-typography-500">{unit.Type}</Text> : null}
          </HStack>
          <CurrentStatusBadge text={unit.CurrentStatus} color={unit.CurrentStatusColor} baseType={unit.CurrentStatusBaseType} isPending={hasPendingStatus} size="sm" testID={`unit-card-${unit.UnitId}-status`} />
          {unit.GroupName ? (
            <HStack space="xs" className="items-center">
              <Building2 size={12} color="#9ca3af" />
              <Text className="text-xs text-typography-500">{unit.GroupName}</Text>
            </HStack>
          ) : null}
          {unit.CurrentDestinationName ? (
            <HStack space="xs" className="items-center">
              <MapPin size={12} color="#d97706" />
              <Text className="text-xs text-warning-700" numberOfLines={1}>{`${t('units.destination')}: ${unit.CurrentDestinationName}`}</Text>
            </HStack>
          ) : null}
        </VStack>
      </HStack>
    </Pressable>
  );
});

UnitCard.displayName = 'UnitCard';
