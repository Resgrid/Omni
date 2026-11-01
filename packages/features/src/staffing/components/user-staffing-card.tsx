import { usePersonnelStatusStore, usePersonnelStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { UserCheck } from 'lucide-react-native';
import React from 'react';

import { useOwnStaffing } from '../hooks/use-own-staffing';
import { MemberStateCard } from './member-state-card';

export interface UserStaffingCardProps {
  /** Opens the staffing sheet (the member home passes the PersonnelStatusSheet on its staffing tab). */
  onPress?: () => void;
  testID?: string;
}

/** "My Staffing": the member's current staffing level, its colour and when it changed, or the level waiting to sync. */
export const UserStaffingCard: React.FC<UserStaffingCardProps> = ({ onPress, testID = 'user-staffing-card' }) => {
  const { t } = useTranslation();
  const staffing = useOwnStaffing();
  const isLoadingOwn = usePersonnelStatusStore((state) => state.loading.currentStaffing === true);
  const isLoadingPersonnel = usePersonnelStore((state) => state.loading.personnel === true);
  const isLoading = isLoadingOwn || isLoadingPersonnel;

  return (
    <MemberStateCard
      title={t('home.user.my_staffing')}
      icon={UserCheck}
      text={staffing.text}
      unknownText={t('home.user.staffing_unknown')}
      color={staffing.color}
      timestamp={staffing.timestamp}
      pendingText={staffing.pendingText}
      isPending={staffing.isPending}
      isLoading={isLoading}
      onPress={onPress}
      testID={testID}
    />
  );
};
