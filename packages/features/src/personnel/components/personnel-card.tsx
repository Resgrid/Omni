import { CurrentStatusBadge } from '@resgrid/features/status';
import { type PersonnelInfoResultData } from '@resgrid/models';
import { HStack, Pressable, Text, TypeIcon, View, VStack } from '@resgrid/ui';
import { Building2, Mail, Phone } from 'lucide-react-native';
import React from 'react';

import { personName } from '../lib/personnel-filters';

export interface PersonnelCardProps {
  person: PersonnelInfoResultData;
  /** Rights DTO `CanViewPII`: without it email and phone are not rendered at all. */
  canViewPII: boolean;
  onPress?: (person: PersonnelInfoResultData) => void;
  hasPendingStatus?: boolean;
}

const initials = (person: PersonnelInfoResultData): string => `${(person.FirstName ?? '').charAt(0)}${(person.LastName ?? '').charAt(0)}`.toUpperCase() || '?';

/** A member row (Responder card): role icon or initials, name, group, status and staffing, roles; PII only with CanViewPII. */
export const PersonnelCard: React.FC<PersonnelCardProps> = React.memo(({ person, canViewPII, onPress, hasPendingStatus = false }) => (
  <Pressable
    testID={`personnel-card-${person.UserId}`}
    onPress={onPress ? () => onPress(person) : undefined}
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}
    className="mb-2 rounded-xl border border-outline-200 bg-background-0 p-3"
  >
    <HStack space="md" className="items-start">
      <View className="size-11 items-center justify-center rounded-full bg-primary-50">
        <TypeIcon iconUrl={person.RoleIconUrl ?? null} size={26} fallback={<Text className="font-bold text-primary-600">{initials(person)}</Text>} />
      </View>
      <VStack className="flex-1" space="xs">
        <Text className="text-base font-semibold text-typography-900">{personName(person)}</Text>
        {person.GroupName ? (
          <HStack space="xs" className="items-center">
            <Building2 size={12} color="#9ca3af" />
            <Text className="text-xs text-typography-500">{person.GroupName}</Text>
          </HStack>
        ) : null}
        <HStack space="xs" className="flex-wrap items-center">
          <CurrentStatusBadge text={person.Status} color={person.StatusColor} baseType={person.StatusBaseType} isPending={hasPendingStatus} size="sm" testID={`personnel-card-${person.UserId}-status`} />
          {person.Staffing ? (
            <CurrentStatusBadge text={person.Staffing} color={person.StaffingColor} baseType={person.StaffingBaseType} kind="staffing" size="sm" testID={`personnel-card-${person.UserId}-staffing`} />
          ) : null}
        </HStack>
        {canViewPII && person.EmailAddress ? (
          <HStack space="xs" className="items-center" testID={`personnel-card-${person.UserId}-email`}>
            <Mail size={12} color="#9ca3af" />
            <Text className="text-xs text-typography-600">{person.EmailAddress}</Text>
          </HStack>
        ) : null}
        {canViewPII && person.MobilePhone ? (
          <HStack space="xs" className="items-center" testID={`personnel-card-${person.UserId}-phone`}>
            <Phone size={12} color="#9ca3af" />
            <Text className="text-xs text-typography-600">{person.MobilePhone}</Text>
          </HStack>
        ) : null}
        {(person.Roles ?? []).length > 0 ? (
          <HStack space="xs" className="flex-wrap">
            {person.Roles.slice(0, 3).map((role) => (
              <Text key={role} className="rounded-full bg-background-100 px-2 py-0.5 text-xs text-typography-700">
                {role}
              </Text>
            ))}
            {person.Roles.length > 3 ? <Text className="rounded-full bg-background-100 px-2 py-0.5 text-xs text-typography-700">{`+${person.Roles.length - 3}`}</Text> : null}
          </HStack>
        ) : null}
      </VStack>
    </HStack>
  </Pressable>
));

PersonnelCard.displayName = 'PersonnelCard';
