import { useTranslation } from '@resgrid/i18n';
import { type PoiResultData } from '@resgrid/models';
import { HStack, Pressable, Text, TypeIcon, View, VStack } from '@resgrid/ui';
import { MapPinned } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { poiLabel } from '../lib/poi-filters';

export interface PoiCardProps {
  poi: PoiResultData;
  onPress?: (poi: PoiResultData) => void;
}

/** A POI row (Dispatch card + U/I type icon): icon, name, type, address, destination and capability tags. */
export const PoiCard: React.FC<PoiCardProps> = React.memo(({ poi, onPress }) => {
  const { t } = useTranslation();
  return (
    <Pressable testID={`poi-card-${poi.PoiId}`} onPress={onPress ? () => onPress(poi) : undefined} accessibilityRole="button" className="mb-2 rounded-xl border border-outline-200 bg-background-0 p-3">
      <HStack space="md" className="items-center">
        <View style={StyleSheet.flatten([styles.icon, { backgroundColor: poi.Color || '#e5e7eb' }])}>
          <TypeIcon iconUrl={poi.IconUrl ?? null} size={22} fallback={<MapPinned size={18} color="#374151" />} />
        </View>
        <VStack className="flex-1" space="xs">
          <Text className="text-base font-semibold text-typography-900" numberOfLines={1}>
            {poiLabel(poi)}
          </Text>
          <Text className="text-xs text-typography-500">{poi.PoiTypeName}</Text>
          {poi.Address && poi.Address !== poi.Name ? (
            <Text className="text-xs text-typography-600" numberOfLines={1}>
              {poi.Address}
            </Text>
          ) : null}
          {poi.IsDestination || (poi.Capabilities ?? []).length > 0 ? (
            <HStack space="xs" className="flex-wrap">
              {poi.IsDestination ? <Text className="rounded-full bg-info-50 px-2 py-0.5 text-xs text-info-700">{t('pois.destination')}</Text> : null}
              {(poi.Capabilities ?? []).map((capability) => (
                <Text key={capability} className="rounded-full bg-background-100 px-2 py-0.5 text-xs text-typography-700">
                  {capability}
                </Text>
              ))}
            </HStack>
          ) : null}
        </VStack>
      </HStack>
    </Pressable>
  );
});

PoiCard.displayName = 'PoiCard';

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
