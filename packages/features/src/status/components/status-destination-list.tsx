import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Spinner, Text, TypeIcon, View, VStack } from '@resgrid/ui';
import { Building2, Check, MapPinned, Phone, X } from 'lucide-react-native';
import React from 'react';

import { destinationLabel, type DestinationLists, type DestinationTab, type StatusDestination } from '../lib/status-destination';

export interface StatusDestinationListProps {
  tabs: DestinationTab[];
  activeTab: DestinationTab;
  onTabChange: (tab: DestinationTab) => void;
  lists: DestinationLists;
  /** What a submit would send (selection or the default call). */
  selected: StatusDestination;
  isLoading: boolean;
  onSelect: (destination: StatusDestination) => void;
}

const TAB_KEYS: Record<DestinationTab, string> = { call: 'status.calls_tab', station: 'status.stations_tab', poi: 'status.pois_tab' };
const EMPTY_KEYS: Record<DestinationTab, string> = { call: 'status.no_calls_available', station: 'status.no_stations_available', poi: 'status.no_pois_available' };

const isSameDestination = (a: StatusDestination, b: StatusDestination): boolean => {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'call':
      return b.type === 'call' && a.call.CallId === b.call.CallId;
    case 'station':
      return b.type === 'station' && a.station.GroupId === b.station.GroupId;
    case 'poi':
      return b.type === 'poi' && a.poi.PoiId === b.poi.PoiId;
    default:
      return true;
  }
};

const DestinationRow: React.FC<{ destination: StatusDestination; isSelected: boolean; onPress: () => void; testID: string; label: string }> = ({ destination, isSelected, onPress, testID, label }) => {
  const fallback =
    destination.type === 'call' ? (
      <Phone size={18} color="#6b7280" />
    ) : destination.type === 'poi' ? (
      <MapPinned size={18} color="#6b7280" />
    ) : destination.type === 'station' ? (
      <Building2 size={18} color="#6b7280" />
    ) : (
      <X size={18} color="#6b7280" />
    );
  const iconUrl = destination.type === 'call' ? destination.call.TypeIconUrl : destination.type === 'poi' ? destination.poi.IconUrl : null;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      className={`mb-2 rounded-lg border px-3 py-2.5 ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-outline-200 bg-background-0'}`}
    >
      <HStack space="sm" className="items-center">
        <TypeIcon iconUrl={iconUrl ?? null} size={18} fallback={fallback} />
        <Text className="flex-1 text-sm font-medium text-typography-900" numberOfLines={2}>
          {label}
        </Text>
        {isSelected ? <Check size={18} color="#3b82f6" /> : null}
      </HStack>
    </Pressable>
  );
};

/** The destination step: calls / stations / POIs tabs (as the status Detail allows) and "No destination". */
export const StatusDestinationList: React.FC<StatusDestinationListProps> = ({ tabs, activeTab, onTabChange, lists, selected, isLoading, onSelect }) => {
  const { t } = useTranslation();

  const items: StatusDestination[] =
    activeTab === 'call'
      ? lists.calls.map((call) => ({ type: 'call', call }))
      : activeTab === 'station'
        ? lists.stations.map((station) => ({ type: 'station', station }))
        : lists.pois.map((poi) => ({ type: 'poi', poi }));

  const keyOf = (destination: StatusDestination): string =>
    destination.type === 'call' ? destination.call.CallId : destination.type === 'station' ? destination.station.GroupId : destination.type === 'poi' ? String(destination.poi.PoiId) : 'none';

  return (
    <VStack space="sm">
      {tabs.length > 1 ? (
        <HStack space="sm" className="mb-1">
          {tabs.map((tab) => (
            <Pressable
              key={tab}
              testID={`status-destination-tab-${tab}`}
              onPress={() => onTabChange(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === activeTab }}
              className={`flex-1 items-center rounded-lg px-3 py-2 ${tab === activeTab ? 'bg-primary-500' : 'bg-background-100'}`}
            >
              <Text className={`text-sm font-semibold ${tab === activeTab ? 'text-typography-0' : 'text-typography-700'}`}>{t(TAB_KEYS[tab])}</Text>
            </Pressable>
          ))}
        </HStack>
      ) : null}

      <DestinationRow destination={{ type: 'none' }} isSelected={selected.type === 'none'} onPress={() => onSelect({ type: 'none' })} testID="status-destination-none" label={t('status.no_destination')} />

      {isLoading && items.length === 0 ? (
        <View className="items-center py-4">
          <Spinner />
        </View>
      ) : items.length === 0 ? (
        <Text className="py-3 text-center text-sm text-typography-500">{t(EMPTY_KEYS[activeTab])}</Text>
      ) : (
        items.map((destination) => (
          <DestinationRow
            key={`${destination.type}-${keyOf(destination)}`}
            destination={destination}
            isSelected={isSameDestination(selected, destination)}
            onPress={() => onSelect(destination)}
            testID={`status-destination-${destination.type}-${keyOf(destination)}`}
            label={destinationLabel(destination)}
          />
        ))
      )}
    </VStack>
  );
};
