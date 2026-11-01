import { useTranslation } from '@resgrid/i18n';
import { type PersonnelInfoResultData, type UnitRoleResultData } from '@resgrid/models';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { ChevronRightIcon, UserIcon, UserXIcon } from 'lucide-react-native';
import React, { useState } from 'react';

import { type EffectiveAssignment } from '../lib/role-assignments';
import { RoleUserSelectionModal } from './role-user-selection-modal';

export interface RoleAssignmentItemProps {
  seat: UnitRoleResultData;
  assignedUser?: PersonnelInfoResultData;
  users: readonly PersonnelInfoResultData[];
  onAssignUser: (userId?: string) => void;
  currentAssignments: readonly EffectiveAssignment[];
}

/** One crew seat: who sits in it (with their status and staffing) and a tap to change it. */
export const RoleAssignmentItem: React.FC<RoleAssignmentItemProps> = ({ seat, assignedUser, users, onAssignUser, currentAssignments }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const name = assignedUser ? `${assignedUser.FirstName ?? ''} ${assignedUser.LastName ?? ''}`.trim() : '';

  return (
    <>
      <Pressable
        testID={`role-assignment-${seat.UnitRoleId}`}
        onPress={() => setIsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('roles.tap_to_assign', { role: seat.Name })}
        className="rounded-lg border border-outline-200 bg-background-0 p-4"
      >
        <HStack space="md" className="items-center">
          <View className={`size-10 items-center justify-center rounded-full ${assignedUser ? 'bg-primary-500' : 'bg-background-100'}`}>
            {assignedUser ? <UserIcon size={18} color="#ffffff" /> : <UserXIcon size={18} color="#737373" />}
          </View>
          <VStack className="flex-1">
            <Text className="text-sm font-semibold text-typography-500">{seat.Name}</Text>
            {assignedUser ? (
              <>
                <Text className="text-base font-medium text-typography-900" testID={`role-assignment-${seat.UnitRoleId}-name`}>
                  {name}
                </Text>
                <Text className="text-xs text-typography-500">{[assignedUser.GroupName, assignedUser.Status, assignedUser.Staffing].filter((part) => !!part).join(' • ')}</Text>
              </>
            ) : (
              <Text className="text-base text-typography-400" testID={`role-assignment-${seat.UnitRoleId}-name`}>
                {t('roles.unassigned')}
              </Text>
            )}
          </VStack>
          <ChevronRightIcon size={20} color="#737373" />
        </HStack>
      </Pressable>
      <RoleUserSelectionModal isOpen={isOpen} onClose={() => setIsOpen(false)} seat={seat} selectedUserId={assignedUser?.UserId} users={users} onSelectUser={onAssignUser} currentAssignments={currentAssignments} />
    </>
  );
};
