import { CapabilityFilterChips, DestinationMetrics, PoiAvailabilityBadge } from '@resgrid/features/pois/components/destination-parts';
import { DestinationRulesSummary, SuggestionsFailedLine } from '@resgrid/features/pois/components/destination-rules-summary';
import { useCapabilityNames } from '@resgrid/features/pois/hooks/use-capability-names';
import { useNearestDestinations } from '@resgrid/features/pois/hooks/use-nearest-destinations';
import { collectCapabilityOptions, type DestinationOrigin, rankDestinations, type RankedDestination, requiredCapabilitiesDown, requiredCapabilitiesMissing } from '@resgrid/features/pois/lib/poi-availability';
import { useTranslation } from '@resgrid/i18n';
import type { NearestDestinationResultData, SuggestedDestinationsResultData } from '@resgrid/models';
import { HStack, Pressable, Spinner, Text, TypeIcon, View, VStack } from '@resgrid/ui';
import { Building2, Check, MapPinned, Phone, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';

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
  /** The call's assigned destination for a transport status, marked on its POI row. */
  assignedPoiId?: number | string | null;
  /**
   * Where the unit is (its last position): POIs are then ranked nearest first, with drive times for the closest and those
   * that can take a patient ahead of diversion and closed ones (`GetNearestDestinations`). Without it they keep list order.
   */
  origin?: DestinationOrigin | null;
  /** The unit travelling, so its travel mode and vehicle limits apply to the drive times. */
  unitId?: string | number | null;
  /**
   * The destination rules' answer for this status (department suggestions on): POIs rank by it while no capability is
   * chosen, the suggested one is marked, each says which required capability it lacks or has down, and a line above them
   * says which rules applied (and which were set aside) and what they ask for.
   */
  suggestion?: SuggestedDestinationsResultData | null;
  /** The rules' answer is on its way: the plain nearest ranking is not asked for meanwhile (both look up drive times). */
  awaitingSuggestion?: boolean;
  /** The rules could not answer for this status (the POIs keep the plain nearest ranking): said with a retry. */
  suggestionFailed?: boolean;
  onRetrySuggestion?: () => void;
  /** The POI that open Enhanced AI destination advice for the call recommends: marked on its row, never selected by itself. */
  aiSuggestedPoiId?: number | null;
}

/** What a POI row says about the destination rules: suggested, and the required capabilities it lacks or has down. */
interface RuleNotes {
  suggested: boolean;
  missing: string[];
  down: string[];
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

const DestinationRow: React.FC<{
  destination: StatusDestination;
  isSelected: boolean;
  onPress: () => void;
  testID: string;
  label: string;
  badge?: string | null;
  /** A POI row ranked from the unit: distance, drive time, Nearest, availability. */
  ranked?: RankedDestination | null;
  capabilityId?: string | null;
  rules?: RuleNotes | null;
  /** Open Enhanced AI destination advice recommends this POI. */
  aiSuggested?: boolean;
}> = ({ destination, isSelected, onPress, testID, label, badge = null, ranked = null, capabilityId = null, rules = null, aiSuggested = false }) => {
  const { t } = useTranslation();

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
        <VStack className="flex-1">
          <Text className="text-sm font-medium text-typography-900" numberOfLines={2}>
            {label}
          </Text>
          {badge ? (
            <Text className="text-xs font-semibold text-primary-600" testID={`${testID}-badge`}>
              {badge}
            </Text>
          ) : null}
          {rules?.suggested ? (
            <Text className="mt-0.5 self-start rounded-full bg-primary-500 px-2 py-0.5 text-xs text-typography-0" testID={`${testID}-suggested`}>
              {t('pois.suggestions.suggested')}
            </Text>
          ) : null}
          {aiSuggested ? (
            <Text className="mt-0.5 self-start rounded-full bg-info-50 px-2 py-0.5 text-xs font-semibold text-info-700" testID={`${testID}-ai-suggested`}>
              {t('pois.ai_advice.suggests')}
            </Text>
          ) : null}
          {ranked ? <DestinationMetrics row={ranked} testID={`${testID}-metrics`} /> : null}
          {destination.type === 'poi' ? <PoiAvailabilityBadge poi={destination.poi} capabilityId={capabilityId} testID={`${testID}-availability`} /> : null}
          {rules && rules.missing.length > 0 ? (
            <Text className="mt-1 self-start rounded-full bg-error-50 px-2 py-0.5 text-xs text-error-700" testID={`${testID}-missing`}>
              {t('pois.suggestions.missing', { names: rules.missing.join(', ') })}
            </Text>
          ) : null}
          {rules && rules.down.length > 0 ? (
            <Text className="mt-1 self-start rounded-full bg-error-50 px-2 py-0.5 text-xs text-error-700" testID={`${testID}-down`}>
              {t('pois.suggestions.down', { names: rules.down.join(', ') })}
            </Text>
          ) : null}
        </VStack>
        {isSelected ? <Check size={18} color="#3b82f6" /> : null}
      </HStack>
    </Pressable>
  );
};

/** The destination step: calls / stations / POIs tabs (as the status Detail allows) and "No destination". */
export const StatusDestinationList: React.FC<StatusDestinationListProps> = ({
  tabs,
  activeTab,
  onTabChange,
  lists,
  selected,
  isLoading,
  onSelect,
  assignedPoiId = null,
  origin = null,
  unitId = null,
  suggestion = null,
  awaitingSuggestion = false,
  suggestionFailed = false,
  onRetrySuggestion,
  aiSuggestedPoiId = null,
}) => {
  const { t } = useTranslation();
  // "Nearest cath lab": one capability at a time narrows the POIs and ranks them for it.
  const [capabilityId, setCapabilityId] = useState<string | null>(null);
  const isPoiTab = activeTab === 'poi';
  const capabilityOptions = useMemo(() => collectCapabilityOptions(lists.pois), [lists.pois]);
  // The destination rules rank the POIs until a capability is chosen (that asks for the nearest offering it instead).
  const byRules = (!!suggestion || awaitingSuggestion) && capabilityId === null;
  const { ranking: nearest } = useNearestDestinations({ origin, capabilityId, unitId, enabled: isPoiTab && lists.pois.length > 0 && !byRules });

  // "Nearest" goes to the first destination that meets the requirements and can take the patient now.
  const ruleRanking = useMemo<NearestDestinationResultData[] | null>(
    () => (byRules && suggestion ? suggestion.Destinations.map((row) => ({ ...row, CanProvide: row.CanProvide && row.MeetsRequirements })) : null),
    [byRules, suggestion]
  );

  const ranking = ruleRanking ?? nearest;
  const rankedPois = useMemo(() => (isPoiTab ? rankDestinations(lists.pois, { origin, capabilityId, ranking }) : []), [capabilityId, isPoiTab, lists.pois, origin, ranking]);
  const rankedById = useMemo(() => new Map(rankedPois.map((row) => [row.poi.PoiId, row])), [rankedPois]);
  const capabilityName = useCapabilityNames(!!suggestion);
  const requiredIds = useMemo(() => suggestion?.Requirements?.RequiredCapabilityIds ?? [], [suggestion]);

  const rulesFor = (destination: StatusDestination): RuleNotes | null => {
    if (!suggestion || destination.type !== 'poi') return null;

    const poi = destination.poi;

    return {
      suggested: suggestion.SuggestedPoiId !== null && suggestion.SuggestedPoiId !== undefined && Number(suggestion.SuggestedPoiId) === Number(poi.PoiId),
      missing: requiredCapabilitiesMissing(poi, requiredIds).map((id) => capabilityName(id, poi)),
      down: requiredCapabilitiesDown(poi, requiredIds).map((id) => capabilityName(id, poi)),
    };
  };

  const isAiSuggested = (destination: StatusDestination): boolean => aiSuggestedPoiId !== null && destination.type === 'poi' && Number(destination.poi.PoiId) === aiSuggestedPoiId;

  const items: StatusDestination[] =
    activeTab === 'call'
      ? lists.calls.map((call) => ({ type: 'call', call }))
      : activeTab === 'station'
        ? lists.stations.map((station) => ({ type: 'station', station }))
        : rankedPois.map((row) => ({ type: 'poi', poi: row.poi }));

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

      {isPoiTab ? <CapabilityFilterChips options={capabilityOptions} selectedId={capabilityId} onChange={setCapabilityId} testID="status-destination-capabilities" /> : null}

      {/* What the destination rules made of the call and the unit's type, or that they could not answer. */}
      {isPoiTab && suggestion ? <DestinationRulesSummary data={suggestion} capabilityName={capabilityName} testID="status-destination-rules" /> : null}
      {isPoiTab && !suggestion && suggestionFailed && onRetrySuggestion ? <SuggestionsFailedLine onRetry={onRetrySuggestion} testID="status-destination-rules-failed" /> : null}

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
            label={destinationLabel(destination, t('data_protection.protected_value'))}
            badge={assignedPoiId != null && destination.type === 'poi' && Number(destination.poi.PoiId) === Number(assignedPoiId) ? t('status.assigned_to_call') : null}
            ranked={destination.type === 'poi' && origin ? (rankedById.get(destination.poi.PoiId) ?? null) : null}
            capabilityId={capabilityId}
            rules={rulesFor(destination)}
            aiSuggested={isAiSuggested(destination)}
          />
        ))
      )}
    </VStack>
  );
};
