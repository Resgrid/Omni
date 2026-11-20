import { formatInTimeZone } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { type DestinationRuleResultData, PoiAvailabilityStatuses, type PoiResultData } from '@resgrid/models';
import { Box, Button, ButtonText, HStack, Pressable, Text, TypeIcon, View, VStack } from '@resgrid/ui';
import { Activity, MapPinned, TriangleAlert } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { type CapabilitySummary, ruleConditionLabelKey, ruleConditions } from '../lib/destination-board';
import { availabilityExpiresAt, isPoiCapabilityUnavailable, poiAvailabilityStatus, poiCapabilityOptions } from '../lib/poi-availability';
import { poiLabel } from '../lib/poi-filters';
import { PoiAvailabilityBadge } from './destination-parts';

export interface DestinationAvailabilityRowProps {
  poi: PoiResultData;
  /** IANA zone the report's end time is shown in (the department's; null for the device's). */
  timeZone: string | null;
  onOpen: (poi: PoiResultData) => void;
  /** Shown only to those who may set availability (Dispatch, IC). */
  onSetAvailability?: (poi: PoiResultData) => void;
}

/** A destination on the Destinations screen: what it offers (struck through when down), its availability, the note and until when. */
export const DestinationAvailabilityRow: React.FC<DestinationAvailabilityRowProps> = React.memo(({ poi, timeZone, onOpen, onSetAvailability }) => {
  const { t } = useTranslation();
  const status = poiAvailabilityStatus(poi);
  const expiresAt = availabilityExpiresAt(poi);
  const capabilities = poiCapabilityOptions(poi);

  return (
    <Box className="mb-2 rounded-xl border border-outline-200 bg-background-0 p-3" testID={`destination-row-${poi.PoiId}`}>
      <Pressable onPress={() => onOpen(poi)} accessibilityRole="button" accessibilityLabel={poiLabel(poi)} testID={`destination-row-${poi.PoiId}-open`}>
        <HStack space="md" className="items-center">
          <View style={StyleSheet.flatten([styles.icon, { backgroundColor: poi.Color || '#e5e7eb' }])}>
            <TypeIcon iconUrl={poi.IconUrl ?? null} size={22} fallback={<MapPinned size={18} color="#374151" />} />
          </View>
          <VStack className="flex-1">
            <Text className="text-base font-semibold text-typography-900" numberOfLines={1}>
              {poiLabel(poi)}
            </Text>
            <Text className="text-xs text-typography-500" numberOfLines={1}>
              {poi.Address && poi.Address !== poi.Name ? `${poi.PoiTypeName} · ${poi.Address}` : poi.PoiTypeName}
            </Text>
          </VStack>
          <PoiAvailabilityBadge poi={poi} showOpen testID={`destination-row-${poi.PoiId}-availability`} />
        </HStack>
      </Pressable>
      {capabilities.length > 0 ? (
        <HStack space="xs" className="mt-2 flex-wrap">
          {capabilities.map((capability) => {
            const isDown = isPoiCapabilityUnavailable(poi, capability.id);

            return (
              <Text
                key={capability.id}
                className={`mb-1 rounded-full px-2 py-0.5 text-xs ${isDown ? 'bg-error-50 text-error-700 line-through' : 'bg-background-100 text-typography-700'}`}
                testID={`destination-row-${poi.PoiId}-capability-${capability.id}`}
              >
                {capability.name}
              </Text>
            );
          })}
        </HStack>
      ) : null}
      {status !== PoiAvailabilityStatuses.Open && poi.AvailabilityNote ? <Text className="mt-1 text-sm text-typography-900">{poi.AvailabilityNote}</Text> : null}
      {expiresAt !== null ? <Text className="mt-1 text-xs text-typography-500">{t('pois.availability.until', { time: formatInTimeZone(new Date(expiresAt), timeZone) })}</Text> : null}
      {onSetAvailability ? (
        <Button variant="outline" size="sm" className="mt-2 self-start" onPress={() => onSetAvailability(poi)} testID={`destination-row-${poi.PoiId}-set`}>
          <Activity size={14} color="#3b82f6" />
          <ButtonText>{t('pois.availability.set')}</ButtonText>
        </Button>
      ) : null}
    </Box>
  );
});

DestinationAvailabilityRow.displayName = 'DestinationAvailabilityRow';

/** A capability with how many destinations offer it and how many cannot provide it now; pressing it lists those destinations. */
export const CapabilitySummaryRow: React.FC<{ summary: CapabilitySummary; onPress: (summary: CapabilitySummary) => void }> = React.memo(({ summary, onPress }) => {
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={() => onPress(summary)}
      accessibilityRole="button"
      accessibilityHint={t('pois.destinations.capabilities.show_hint')}
      className="mb-2 rounded-xl border border-outline-200 bg-background-0 p-3"
      testID={`destination-capability-${summary.id}`}
    >
      <HStack space="sm" className="items-center justify-between">
        <Text className="flex-1 text-base font-semibold text-typography-900">{summary.name}</Text>
        {summary.unavailableAt > 0 ? (
          <Text className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-semibold text-error-700" testID={`destination-capability-${summary.id}-unavailable`}>
            {t('pois.destinations.capabilities.unavailable', { count: summary.unavailableAt })}
          </Text>
        ) : null}
      </HStack>
      <Text className="mt-1 text-xs text-typography-500" testID={`destination-capability-${summary.id}-offered`}>
        {t('pois.destinations.capabilities.offered_by', { count: summary.offeredBy })}
      </Text>
    </Pressable>
  );
});

CapabilitySummaryRow.displayName = 'CapabilitySummaryRow';

const Chips: React.FC<{ names: readonly string[]; tone: string; empty: string; testID: string }> = ({ names, tone, empty, testID }) =>
  names.length > 0 ? (
    <HStack space="xs" className="flex-1 flex-wrap" testID={testID}>
      {names.map((name) => (
        <Text key={name} className={`mb-1 rounded-full px-2 py-0.5 text-xs ${tone}`}>
          {name}
        </Text>
      ))}
    </HStack>
  ) : (
    <Text className="flex-1 text-xs text-typography-500" testID={testID}>
      {empty}
    </Text>
  );

/** A destination rule, read-only: when it applies, which destination types, what is required and preferred. */
export const DestinationRuleCard: React.FC<{ rule: DestinationRuleResultData }> = React.memo(({ rule }) => {
  const { t } = useTranslation();
  const deleted = t('pois.destinations.rules.deleted');
  const conditions = ruleConditions(rule);

  const when = conditions.length === 0 ? t('pois.destinations.rules.every_call') : conditions.map((condition) => t(ruleConditionLabelKey(condition.kind), { name: condition.name ?? deleted })).join(' · ');

  const types = (rule.PoiTypeIds ?? []).length === 0 ? [] : (rule.PoiTypeNames ?? []);
  const missing = rule.MissingReferenceCount ?? 0;

  return (
    <Box className="mb-2 rounded-xl border border-outline-200 bg-background-0 p-3" testID={`destination-rule-${rule.DestinationRuleId}`}>
      <Text className="text-base font-semibold text-typography-900">{rule.Name}</Text>
      <Text className="mt-1 text-xs text-typography-600" testID={`destination-rule-${rule.DestinationRuleId}-when`}>
        {when}
      </Text>
      <HStack space="sm" className="mt-2 items-start">
        <Text className="w-24 text-xs font-semibold text-typography-700">{t('pois.destinations.rules.destination')}</Text>
        <Chips names={types} tone="bg-info-50 text-info-700" empty={t('pois.destinations.rules.any_destination')} testID={`destination-rule-${rule.DestinationRuleId}-types`} />
      </HStack>
      <HStack space="sm" className="mt-1 items-start">
        <Text className="w-24 text-xs font-semibold text-typography-700">{t('pois.destinations.rules.requires')}</Text>
        <Chips names={rule.RequiredCapabilityNames ?? []} tone="bg-background-100 text-typography-900" empty={t('pois.destinations.rules.nothing')} testID={`destination-rule-${rule.DestinationRuleId}-requires`} />
      </HStack>
      <HStack space="sm" className="mt-1 items-start">
        <Text className="w-24 text-xs font-semibold text-typography-700">{t('pois.destinations.rules.prefers')}</Text>
        <Chips names={rule.PreferredCapabilityNames ?? []} tone="bg-success-50 text-success-700" empty={t('pois.destinations.rules.nothing')} testID={`destination-rule-${rule.DestinationRuleId}-prefers`} />
      </HStack>
      {missing > 0 ? (
        <HStack space="xs" className="mt-2 items-center" testID={`destination-rule-${rule.DestinationRuleId}-attention`}>
          <TriangleAlert size={14} color="#d97706" />
          <Text className="flex-1 text-xs text-warning-700">{t('pois.destinations.rules.needs_attention', { count: missing })}</Text>
        </HStack>
      ) : null}
    </Box>
  );
});

DestinationRuleCard.displayName = 'DestinationRuleCard';

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
