import { usePersonnelStatusStore, usePersonnelStore } from '@resgrid/data';
import { MemberStateCard } from '@resgrid/features/staffing';
import { useTranslation } from '@resgrid/i18n';
import { User } from 'lucide-react-native';
import React from 'react';

import { useOwnStatus } from '../hooks/use-own-status';

export interface UserStatusCardProps {
  /** Opens the status sheet. */
  onPress?: () => void;
  testID?: string;
}

/** "My Status": the member's current personnel status, its destination and when it changed, or the status waiting to sync. */
export const UserStatusCard: React.FC<UserStatusCardProps> = ({ onPress, testID = 'user-status-card' }) => {
  const { t } = useTranslation();
  const status = useOwnStatus();
  const isLoadingOwn = usePersonnelStatusStore((state) => state.loading.currentStatus === true);
  const isLoadingPersonnel = usePersonnelStore((state) => state.loading.personnel === true);

  return (
    <MemberStateCard
      title={t('home.user.my_status')}
      icon={User}
      text={status.text}
      unknownText={t('home.user.status_unknown')}
      color={status.color}
      timestamp={status.timestamp}
      detail={status.destination ? `${t('member_home.destination')}: ${status.destination}` : null}
      pendingText={status.pendingText}
      isPending={status.isPending}
      isLoading={isLoadingOwn || isLoadingPersonnel}
      onPress={onPress}
      testID={testID}
    />
  );
};
