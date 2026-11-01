import { useUnitRolesStore } from '@resgrid/data';
import { useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, VStack } from '@resgrid/ui';
import { Users } from 'lucide-react-native';
import React, { useState } from 'react';

import { UnitRolesSheet } from './unit-roles-sheet';

export interface UnitRolesButtonProps {
  unitId?: string | null;
}

/** "2 of 4 Roles — tap to manage": the crew summary on Unit's status console that opens the roles sheet. */
export const UnitRolesButton: React.FC<UnitRolesButtonProps> = ({ unitId: unitIdProp }) => {
  const { t } = useTranslation();
  const { activeUnitId } = useStatusContext();
  const unitId = unitIdProp ?? activeUnitId;
  const [isOpen, setIsOpen] = useState(false);
  const total = useUnitRolesStore((state) => (unitId ? (state.rolesByUnit[unitId]?.length ?? state.roles.filter((seat) => seat.UnitId === unitId).length) : 0));
  const active = useUnitRolesStore((state) => (unitId ? (state.assignmentsByUnit[unitId] ?? []).filter((seat) => !!seat.UserId?.trim()).length : 0));

  if (!unitId) return null;

  return (
    <>
      <Pressable testID="unit-roles-button" onPress={() => setIsOpen(true)} accessibilityRole="button" accessibilityHint={t('roles.tap_to_manage')} className="rounded-lg bg-background-50 p-3">
        <HStack space="sm" className="items-center">
          <Users size={18} color="#6b7280" />
          <VStack className="flex-1">
            <Text className="font-semibold text-typography-900">{t('roles.status', { active, total })}</Text>
            <Text className="text-xs text-typography-500">{t('roles.tap_to_manage')}</Text>
          </VStack>
        </HStack>
      </Pressable>
      <UnitRolesSheet isOpen={isOpen} onClose={() => setIsOpen(false)} unitId={unitId} />
    </>
  );
};
