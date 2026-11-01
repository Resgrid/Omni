import { useTranslation } from '@resgrid/i18n';
import { type PoiTypeResultData } from '@resgrid/models';
import { HStack, Pressable, ScrollView, Text } from '@resgrid/ui';
import React from 'react';

import { type PoiListFilter } from '../lib/poi-filters';

export interface PoiFilterBarProps {
  filter: PoiListFilter;
  onChange: (filter: PoiListFilter) => void;
  poiTypes: readonly PoiTypeResultData[];
  /** Capability keys offered by the loaded POIs; the capability row is hidden when there are none. */
  capabilities: readonly string[];
}

const Chip: React.FC<{ label: string; selected: boolean; onPress: () => void; testID: string }> = ({ label, selected, onPress, testID }) => (
  <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} className={`rounded-full px-3 py-1.5 ${selected ? 'bg-primary-500' : 'bg-background-100'}`}>
    <Text className={`text-sm ${selected ? 'text-typography-0' : 'text-typography-700'}`}>{label}</Text>
  </Pressable>
);

/** POI type chips, a destination-only toggle and capability chips (Dispatch POI filters). */
export const PoiFilterBar: React.FC<PoiFilterBarProps> = ({ filter, onChange, poiTypes, capabilities }) => {
  const { t } = useTranslation();
  const toggleCapability = (capability: string) =>
    onChange({ ...filter, capabilities: filter.capabilities.includes(capability) ? filter.capabilities.filter((value) => value !== capability) : [...filter.capabilities, capability] });

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2 max-h-10">
        <HStack space="sm">
          <Chip label={t('pois.all_types')} selected={!filter.poiTypeId} onPress={() => onChange({ ...filter, poiTypeId: null })} testID="poi-type-all" />
          {poiTypes.map((type) => (
            <Chip key={type.PoiTypeId} label={type.Name} selected={filter.poiTypeId === type.PoiTypeId} onPress={() => onChange({ ...filter, poiTypeId: type.PoiTypeId })} testID={`poi-type-${type.PoiTypeId}`} />
          ))}
          <Chip label={t('pois.destinations_only')} selected={filter.destinationOnly} onPress={() => onChange({ ...filter, destinationOnly: !filter.destinationOnly })} testID="poi-destination-only" />
        </HStack>
      </ScrollView>
      {capabilities.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2 max-h-10">
          <HStack space="sm">
            {capabilities.map((capability) => (
              <Chip key={capability} label={capability} selected={filter.capabilities.includes(capability)} onPress={() => toggleCapability(capability)} testID={`poi-capability-${capability}`} />
            ))}
          </HStack>
        </ScrollView>
      ) : null}
    </>
  );
};
