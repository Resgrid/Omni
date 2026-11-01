import { useTranslation } from '@resgrid/i18n';
import { HStack, Text, View } from '@resgrid/ui';
import { CloudOff } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { type AvailabilityClass, staffingAvailability, statusAvailability } from '../lib/base-types';
import { readableColors } from '../lib/readable-colors';

export interface CurrentStatusBadgeProps {
  /** The status (or staffing) text as the department named it. */
  text: string | null | undefined;
  /** The department's colour for it. */
  color?: string | null;
  /** What it means (ActionBaseTypes for a status, StaffingBaseTypes for staffing). */
  baseType?: number | null;
  kind?: 'status' | 'staffing';
  /** The name of a newer status queued on the device; shown instead of `text` until it syncs. */
  pendingText?: string | null;
  /** A newer write is queued on the device (marker only, when its name is not at hand). */
  isPending?: boolean;
  /** Shows the availability meaning beside the name ("Available", "Committed"…). */
  showAvailability?: boolean;
  size?: 'sm' | 'md';
  testID?: string;
}

const AVAILABILITY_KEYS: Record<AvailabilityClass, string> = {
  available: 'status.availability.available',
  delayed: 'status.availability.delayed',
  committed: 'status.availability.committed',
  unavailable: 'status.availability.unavailable',
  unknown: 'status.availability.unknown',
};

/** Availability from the meaning, never from the name: a department's "IN QUARTERS" is as available as "Available". */
export const availabilityOf = (kind: 'status' | 'staffing', baseType: number | null | undefined): AvailabilityClass => (kind === 'staffing' ? staffingAvailability(baseType) : statusAvailability(baseType));

/**
 * The current status (or staffing) of a unit or person: the department's colour and name, its meaning, and a
 * "pending sync" marker while a newer status waits in the outbox.
 */
export const CurrentStatusBadge: React.FC<CurrentStatusBadgeProps> = ({
  text,
  color,
  baseType,
  kind = 'status',
  pendingText,
  isPending = false,
  showAvailability = false,
  size = 'md',
  testID = 'current-status-badge',
}) => {
  const { t } = useTranslation();
  const display = pendingText || text || t('common.unknown');
  const { backgroundColor, textColor } = readableColors(color, '#9ca3af');
  const availability = availabilityOf(kind, baseType);
  const showPending = isPending || !!pendingText;

  return (
    <HStack space="xs" className="flex-wrap items-center" testID={testID} accessibilityLabel={showPending ? `${display}, ${t('status.pending_sync')}` : display}>
      <View style={StyleSheet.flatten([styles.chip, size === 'sm' ? styles.chipSm : null, { backgroundColor }])}>
        <Text style={{ color: textColor }} className={size === 'sm' ? 'text-xs font-semibold' : 'text-sm font-semibold'} numberOfLines={1}>
          {display}
        </Text>
      </View>
      {showAvailability && availability !== 'unknown' ? (
        <Text className="text-xs text-typography-500" testID={`${testID}-availability`}>
          {t(AVAILABILITY_KEYS[availability])}
        </Text>
      ) : null}
      {showPending ? (
        <HStack space="xs" className="items-center" testID={`${testID}-pending`}>
          <CloudOff size={12} color="#d97706" />
          <Text className="text-xs text-warning-600">{t('status.pending_sync')}</Text>
        </HStack>
      ) : null}
    </HStack>
  );
};

const styles = StyleSheet.create({
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipSm: { paddingHorizontal: 8, paddingVertical: 2 },
});
