import { useTranslation } from '@resgrid/i18n';
import type { IncidentRoleAssignment } from '@resgrid/models';
import { HStack, Text, VStack } from '@resgrid/ui';
import { CloudOff, UserCog, UserPlus, X } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { isLocalId } from '../lib/board';
import { incidentRoleName } from '../lib/labels';
import { BoardButton, IconPress } from './board-buttons';
import { SectionCard, SectionEmpty } from './section-card';

export interface RolesSectionProps {
  roles: IncidentRoleAssignment[];
  personName: (userId: string) => string;
  canManage: boolean;
  onAdd: () => void;
  onRemove: (role: IncidentRoleAssignment) => void;
  testID?: string;
}

/** ICS positions on the incident (IC roles + Dispatch roles section), in position order. */
export const RolesSection: React.FC<RolesSectionProps> = ({ roles, personName, canManage, onAdd, onRemove, testID = 'command-roles' }) => {
  const { t } = useTranslation();
  const active = useMemo(() => roles.filter((role) => !role.RemovedOn).sort((a, b) => a.RoleType - b.RoleType), [roles]);
  return (
    <SectionCard
      title={t('incident_command.roles')}
      icon={UserCog}
      count={active.length}
      action={canManage ? <BoardButton label={t('incident_command.assign_role')} icon={UserPlus} onPress={onAdd} testID={`${testID}-add`} /> : undefined}
      testID={testID}
    >
      {active.length === 0 ? (
        <SectionEmpty text={t('incident_command.no_roles')} />
      ) : (
        <VStack>
          {active.map((role) => (
            <HStack key={role.IncidentRoleAssignmentId} className="items-center justify-between border-b border-outline-50 py-1" testID={`${testID}-item-${role.IncidentRoleAssignmentId}`}>
              <VStack className="min-w-0 flex-1">
                <Text className="text-sm font-medium text-typography-900">{incidentRoleName(t, role.RoleType)}</Text>
                <Text className="text-xs text-typography-500">{personName(role.UserId)}</Text>
              </VStack>
              {isLocalId(role.IncidentRoleAssignmentId) ? (
                <View accessibilityLabel={t('incident_command.pending_sync')}>
                  <CloudOff size={14} color="#f59e0b" />
                </View>
              ) : canManage ? (
                <IconPress
                  label={t('incident_command.remove_role', { role: incidentRoleName(t, role.RoleType) })}
                  icon={X}
                  color="#dc2626"
                  onPress={() => onRemove(role)}
                  testID={`${testID}-remove-${role.IncidentRoleAssignmentId}`}
                />
              ) : null}
            </HStack>
          ))}
        </VStack>
      )}
    </SectionCard>
  );
};
