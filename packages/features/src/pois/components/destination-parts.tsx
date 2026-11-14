import { formatDistance, formatEta } from '@resgrid/features/calls/lib/dispatch-board';
import { useTranslation } from '@resgrid/i18n';
import { PoiAvailabilityStatuses, type PoiResultData } from '@resgrid/models';
import { HStack, Pressable, ScrollRow, Text } from '@resgrid/ui';
import React from 'react';

import { availabilityLabelKey, isPoiCapabilityUnavailable, poiAvailabilityStatus, type PoiCapabilityOption, type RankedDestination } from '../lib/poi-availability';

const TONE: Record<PoiAvailabilityStatuses, string> = {
  [PoiAvailabilityStatuses.Open]: 'bg-success-50 text-success-700',
  [PoiAvailabilityStatuses.Limited]: 'bg-warning-50 text-warning-700',
  [PoiAvailabilityStatuses.Diversion]: 'bg-error-50 text-error-700',
  [PoiAvailabilityStatuses.Closed]: 'bg-error-600 text-typography-0',
};

export interface PoiAvailabilityBadgeProps {
  poi: PoiResultData;
  /** With a capability chosen, also says when this destination reports it unavailable. */
  capabilityId?: string | null;
  /** Shows "Open" too (POI detail); lists show nothing for an open destination. */
  showOpen?: boolean;
  testID?: string;
}

/** A destination's availability (Limited / Diversion / Closed) as a pill, and a chosen capability that is down. */
export const PoiAvailabilityBadge: React.FC<PoiAvailabilityBadgeProps> = ({ poi, capabilityId = null, showOpen = false, testID }) => {
  const { t } = useTranslation();
  const status = poiAvailabilityStatus(poi);
  const capabilityDown = isPoiCapabilityUnavailable(poi, capabilityId);

  if (status === PoiAvailabilityStatuses.Open && !showOpen) return null;

  return (
    <HStack space="xs" className="flex-wrap items-center" testID={testID}>
      <Text className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[status]}`}>{t(availabilityLabelKey(status))}</Text>
      {capabilityDown ? <Text className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-semibold text-error-700">{t('pois.availability.capability_unavailable')}</Text> : null}
    </HStack>
  );
};

export interface CapabilityFilterChipsProps {
  options: readonly PoiCapabilityOption[];
  /** The chosen capability id; null shows every destination. */
  selectedId: string | null;
  onChange: (capabilityId: string | null) => void;
  testID?: string;
}

const Chip: React.FC<{ label: string; selected: boolean; onPress: () => void; testID: string }> = ({ label, selected, onPress, testID }) => (
  <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} className={`rounded-full px-3 py-1.5 ${selected ? 'bg-primary-500' : 'bg-background-100'}`}>
    <Text className={`text-sm ${selected ? 'text-typography-0' : 'text-typography-700'}`}>{label}</Text>
  </Pressable>
);

/** One capability at a time ("nearest cath lab"), or all destinations. Nothing when no destination offers any. */
export const CapabilityFilterChips: React.FC<CapabilityFilterChipsProps> = ({ options, selectedId, onChange, testID = 'destination-capability-chips' }) => {
  const { t } = useTranslation();

  if (options.length === 0) return null;

  return (
    <ScrollRow className="mb-2" testID={testID}>
      <HStack space="sm">
        <Chip label={t('pois.all_capabilities')} selected={selectedId === null} onPress={() => onChange(null)} testID={`${testID}-all`} />
        {options.map((option) => (
          <Chip key={option.id} label={option.name} selected={selectedId === option.id} onPress={() => onChange(selectedId === option.id ? null : option.id)} testID={`${testID}-${option.id}`} />
        ))}
      </HStack>
    </ScrollRow>
  );
};

/** "Nearest · 8.4 km · 12:30 min" for a ranked destination; nothing without an origin. */
export const DestinationMetrics: React.FC<{ row: RankedDestination; testID?: string }> = ({ row, testID }) => {
  const { t } = useTranslation();
  const parts = [row.isNearest ? t('pois.nearest') : null, formatDistance(row.distanceMeters), formatEta(row.travelSeconds)].filter((part): part is string => !!part);

  if (parts.length === 0) return null;

  return (
    <Text className={`text-xs ${row.isNearest ? 'font-semibold text-success-700' : 'text-typography-500'}`} testID={testID}>
      {parts.join(' · ')}
    </Text>
  );
};
