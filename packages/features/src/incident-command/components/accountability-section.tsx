import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { PersonnelCallCheckInStatus } from '@resgrid/models';
import { Badge, BadgeText, HStack, Text, VStack } from '@resgrid/ui';
import { ShieldCheck } from 'lucide-react-native';
import React, { useMemo } from 'react';

import { accountabilityCounts, sortAccountability } from '../lib/board';
import { parStatusAction, parStatusName } from '../lib/labels';
import { SectionCard, SectionEmpty } from './section-card';

export interface AccountabilitySectionProps {
  rows: PersonnelCallCheckInStatus[];
  /** Names for rows the server sent without one. */
  personName: (userId: string) => string;
  /** Opens the call's check-in tab (PAR actions live in the check-in feature). */
  onOpenCheckIns?: () => void;
  testID?: string;
}

/**
 * Personnel accountability (PAR) from the board's check-in statuses (IC accountability section): counts by status and
 * the members, most urgent first, one row each (older servers send a row per dispatch). Checking people in happens in
 * the call's check-in tab, which owns PAR writes for every app.
 */
export const AccountabilitySection: React.FC<AccountabilitySectionProps> = ({ rows, personName, onOpenCheckIns, testID = 'command-accountability' }) => {
  const { t } = useTranslation();
  const counts = useMemo(() => accountabilityCounts(rows), [rows]);
  const sorted = useMemo(() => sortAccountability(rows), [rows]);

  return (
    <SectionCard
      title={t('incident_command.accountability')}
      icon={ShieldCheck}
      count={counts.total}
      action={
        onOpenCheckIns ? (
          <Text className="text-sm font-medium text-primary-600" onPress={onOpenCheckIns} accessibilityRole="link" testID={`${testID}-open-check-ins`}>
            {t('incident_command.open_check_ins')}
          </Text>
        ) : undefined
      }
      testID={testID}
    >
      <HStack className="mb-2 flex-wrap" space="sm" testID={`${testID}-counts`}>
        <Badge action="success" variant="outline">
          <BadgeText>{t('incident_command.par_count_green', { count: counts.green })}</BadgeText>
        </Badge>
        <Badge action="warning" variant="outline">
          <BadgeText>{t('incident_command.par_count_warning', { count: counts.warning })}</BadgeText>
        </Badge>
        <Badge action="error" variant="outline">
          <BadgeText>{t('incident_command.par_count_critical', { count: counts.critical })}</BadgeText>
        </Badge>
      </HStack>
      {sorted.length === 0 ? (
        <SectionEmpty text={t('incident_command.no_accountability')} />
      ) : (
        <VStack space="xs">
          {sorted.map((row) => (
            <HStack key={row.UserId} className="items-center justify-between border-b border-outline-50 py-1" testID={`${testID}-row-${row.UserId}`}>
              <VStack className="min-w-0 flex-1">
                <Text className="text-sm font-medium text-typography-900" numberOfLines={1}>
                  {row.FullName || personName(row.UserId)}
                </Text>
                <Text className="text-xs text-typography-500">
                  {row.LastCheckIn ? t('incident_command.last_check_in', { time: formatUtcInDepartmentTime(row.LastCheckIn, null) }) : t('incident_command.never_checked_in')}
                </Text>
              </VStack>
              <Badge action={parStatusAction(row.Status)} size="sm">
                <BadgeText>{parStatusName(t, row.Status)}</BadgeText>
              </Badge>
            </HStack>
          ))}
        </VStack>
      )}
    </SectionCard>
  );
};
