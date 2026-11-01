import { useTranslation } from '@resgrid/i18n';
import { type PersonnelInfoResultData, type UnitRoleResultData } from '@resgrid/models';
import { Button, ButtonText, HStack, Input, InputField, Modal, ModalBackdrop, ModalBody, ModalContent, ModalFooter, ModalHeader, Pressable, Text, View, VStack } from '@resgrid/ui';
import { CheckIcon, UserIcon, UserXIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { type EffectiveAssignment, isUnqualifiedForSeat } from '../lib/role-assignments';

export interface RoleUserSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  seat: UnitRoleResultData;
  selectedUserId?: string;
  users: readonly PersonnelInfoResultData[];
  onSelectUser: (userId?: string) => void;
  currentAssignments: readonly EffectiveAssignment[];
}

const fullName = (user: Pick<PersonnelInfoResultData, 'FirstName' | 'LastName'>): string => `${user.FirstName ?? ''} ${user.LastName ?? ''}`.trim();

/**
 * Who sits in a seat (Unit). Opens from inside the roles sheet, which is a native window (CustomBottomSheet), so the
 * modal uses `useRNModal` to present above it instead of behind it.
 */
export const RoleUserSelectionModal: React.FC<RoleUserSelectionModalProps> = ({ isOpen, onClose, seat, selectedUserId, users, onSelectUser, currentAssignments }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => fullName(user).toLowerCase().includes(needle) || (user.GroupName ?? '').toLowerCase().includes(needle));
  }, [query, users]);

  const select = useCallback(
    (userId?: string) => {
      onSelectUser(userId);
      onClose();
    },
    [onClose, onSelectUser]
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" useRNModal>
      <ModalBackdrop />
      <ModalContent className="max-h-[85%] rounded-2xl" testID="role-user-selection-modal">
        <ModalHeader>
          <Text className="text-lg font-bold text-typography-900">{seat.Name}</Text>
        </ModalHeader>
        <ModalBody>
          <VStack space="sm">
            <Input variant="outline" size="md">
              <InputField testID="role-user-search" value={query} onChangeText={setQuery} placeholder={t('roles.search_people')} accessibilityLabel={t('roles.search_people')} />
            </Input>
            <Pressable testID="role-user-unassign" onPress={() => select(undefined)} accessibilityRole="button" className="rounded-lg px-3 py-3">
              <HStack space="md" className="items-center">
                <UserXIcon size={18} color="#737373" />
                <Text className="text-base text-typography-600">{t('roles.unassigned')}</Text>
              </HStack>
            </Pressable>
            {filtered.length === 0 ? <Text className="py-4 text-center text-typography-500">{t('roles.no_people')}</Text> : null}
            {filtered.map((user) => {
              const isSelected = user.UserId === selectedUserId;
              const elsewhere = currentAssignments.find((assignment) => assignment.userId === user.UserId && assignment.roleId !== seat.UnitRoleId);
              const unqualified = isUnqualifiedForSeat(seat, user.Roles);
              return (
                <Pressable
                  key={user.UserId}
                  testID={`role-user-${user.UserId}`}
                  onPress={() => select(user.UserId)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={fullName(user)}
                  className={`rounded-lg px-3 py-3 ${isSelected ? 'bg-primary-50' : ''}`}
                >
                  <HStack space="md" className="items-center">
                    <View className={`size-9 items-center justify-center rounded-full ${isSelected ? 'bg-primary-500' : 'bg-background-100'}`}>
                      {isSelected ? <CheckIcon size={16} color="#ffffff" /> : <UserIcon size={16} color="#737373" />}
                    </View>
                    <VStack className="flex-1">
                      <Text className="text-base font-medium text-typography-900">{fullName(user)}</Text>
                      {user.GroupName ? <Text className="text-xs text-typography-500">{user.GroupName}</Text> : null}
                    </VStack>
                    {elsewhere ? (
                      <Text className="rounded-full bg-warning-100 px-2 py-0.5 text-xs text-warning-700" testID={`role-user-${user.UserId}-elsewhere`}>
                        {elsewhere.roleName || t('roles.assigned_elsewhere')}
                      </Text>
                    ) : null}
                    {unqualified ? (
                      <Text className="rounded-full bg-error-50 px-2 py-0.5 text-xs text-error-600" testID={`role-user-${user.UserId}-unqualified`}>
                        {t('roles.not_qualified')}
                      </Text>
                    ) : null}
                  </HStack>
                </Pressable>
              );
            })}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" action="secondary" onPress={onClose} testID="role-user-cancel">
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
