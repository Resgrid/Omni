import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { CurrentStatusBadge } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { Text, VStack } from '@resgrid/ui';
import React from 'react';

import type { UnitStatusDisplay } from '../lib/status-display';

export interface CurrentStatusCardProps {
  status: UnitStatusDisplay;
  testID?: string;
}

/**
 * The unit's current status (Unit `status-sidebar`, fixed): the department's name and colour with its meaning, where the
 * unit is responding to and since when, and a "pending sync" marker while a newer status waits in the outbox.
 */
export const CurrentStatusCard: React.FC<CurrentStatusCardProps> = ({ status, testID = 'unit-current-status' }) => {
  const { t } = useTranslation();
  const since = status.timestampUtc ? formatUtcInDepartmentTime(status.timestampUtc, null) : '';
  return (
    <VStack space="xs" className="rounded-xl border border-outline-100 bg-background-50 p-3" testID={testID}>
      <Text className="text-xs font-semibold uppercase text-typography-500">{t('status.current_status')}</Text>
      <CurrentStatusBadge text={status.text} color={status.color} baseType={status.baseType} pendingText={status.pendingText} isPending={status.isPending} showAvailability testID={`${testID}-badge`} />
      {status.destinationName ? (
        <Text className="text-sm text-typography-700" numberOfLines={2} testID={`${testID}-destination`}>
          {t('unit_status.responding_to', { name: status.destinationName })}
        </Text>
      ) : null}
      {since ? (
        <Text className="text-xs text-typography-500" testID={`${testID}-since`}>
          {t('unit_status.since', { time: since })}
        </Text>
      ) : null}
    </VStack>
  );
};
