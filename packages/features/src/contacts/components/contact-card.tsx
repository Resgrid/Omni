import { ProtectedFieldIds } from '@resgrid/auth';
import { ProtectedText } from '@resgrid/features/data-protection';
import { type ContactResultData, ContactType } from '@resgrid/models';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { BuildingIcon, StarIcon, UserIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { contactDisplayName } from '../lib/contact-format';

export interface ContactCardProps {
  contact: ContactResultData;
  onPress?: (contact: ContactResultData) => void;
}

/** A contact row: person/company icon, name (protected when withheld), category and the first reachable detail. */
export const ContactCard: React.FC<ContactCardProps> = React.memo(({ contact, onPress }) => {
  const isCompany = contact.ContactType === ContactType.Company;
  const name = contactDisplayName(contact);
  const nameFieldId = isCompany ? ProtectedFieldIds.contactCompanyName : ProtectedFieldIds.contactFirstName;
  // The first reachable detail; office phone is not a protected catalog field.
  const detail: { value: string; fieldId: string | null } | null = contact.CellPhoneNumber
    ? { value: contact.CellPhoneNumber, fieldId: ProtectedFieldIds.contactCellPhone }
    : contact.OfficePhoneNumber
      ? { value: contact.OfficePhoneNumber, fieldId: null }
      : contact.Email
        ? { value: contact.Email, fieldId: ProtectedFieldIds.contactEmail }
        : null;
  const category = contact.CategoryName ?? contact.Category?.Name;

  return (
    <Pressable testID={`contact-card-${contact.ContactId}`} onPress={onPress ? () => onPress(contact) : undefined} accessibilityRole="button" className="mb-2 rounded-xl border border-outline-200 bg-background-0 p-3">
      <HStack space="md" className="items-center">
        <View className="size-10 items-center justify-center rounded-full bg-primary-50">{isCompany ? <BuildingIcon size={18} color="#3b82f6" /> : <UserIcon size={18} color="#3b82f6" />}</View>
        <VStack className="flex-1" space="xs">
          <HStack space="xs" className="items-center">
            <ProtectedText value={name} fieldId={nameFieldId} redactedFields={contact.RedactedFields} className="flex-1 text-base font-semibold text-typography-900" testID={`contact-card-${contact.ContactId}-name`} />
            {contact.IsImportant ? <StarIcon size={14} color="#f59e0b" /> : null}
          </HStack>
          {category ? (
            <HStack space="xs" className="items-center">
              <View style={StyleSheet.flatten([styles.dot, { backgroundColor: contact.CategoryColor || contact.Category?.Color || '#9ca3af' }])} />
              <Text className="text-xs text-typography-500">{category}</Text>
            </HStack>
          ) : null}
          {detail ? (
            detail.fieldId ? (
              <ProtectedText value={detail.value} fieldId={detail.fieldId} redactedFields={contact.RedactedFields} size="sm" className="text-typography-600" />
            ) : (
              <Text size="sm" className="text-typography-600">
                {detail.value}
              </Text>
            )
          ) : null}
        </VStack>
      </HStack>
    </Pressable>
  );
});

ContactCard.displayName = 'ContactCard';

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
});
