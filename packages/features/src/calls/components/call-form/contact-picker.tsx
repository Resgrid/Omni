import { useContactsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { ContactResultData } from '@resgrid/models';
import { Input, InputField, Pressable, Spinner, Text } from '@resgrid/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ContactPickerProps } from '../../hook-points';
import { parseCoordinates } from '../../lib/call-form';
import { CallModalFrame } from '../call-modal-frame';

/** The name a call shows for a contact (Dispatch contact picker): the company, else the person's names, else the record name. */
export const contactDisplayName = (contact: ContactResultData): string =>
  contact.CompanyName?.trim() || [contact.FirstName, contact.MiddleName, contact.LastName].filter((part) => !!part?.trim()).join(' ') || contact.Name?.trim() || '';

/** How to reach a contact: e-mail first, then a phone number. */
export const contactReachInfo = (contact: ContactResultData): string =>
  contact.Email?.trim() || contact.Phone?.trim() || contact.Mobile?.trim() || contact.CellPhoneNumber?.trim() || contact.OfficePhoneNumber?.trim() || contact.HomePhoneNumber?.trim() || '';

/** Search covers the name and every way to reach the contact the row can show. */
const matches = (contact: ContactResultData, needle: string): boolean =>
  !needle ||
  [contactDisplayName(contact), contact.Email, contact.Phone, contact.Mobile, contact.CellPhoneNumber, contact.OfficePhoneNumber, contact.HomePhoneNumber].some((value) => !!value && value.toLowerCase().includes(needle));

/**
 * Pick the call's contact from the department's contacts (Dispatch contact picker): fills the contact name and how to
 * reach them, links the contact to the call, and — when the call has none yet — its address and location.
 */
export const CallContactPicker: React.FC<ContactPickerProps> = ({ isOpen, onClose, onSelect }) => {
  const { t } = useTranslation();
  const contacts = useContactsStore((state) => state.contacts);
  const isLoading = useContactsStore((state) => state.loading.contacts === true);
  const fetchContacts = useContactsStore((state) => state.fetchContacts);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => contacts.filter((contact) => matches(contact, needle)), [contacts, needle]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    void fetchContacts();
  }, [fetchContacts, isOpen]);

  const pick = (contact: ContactResultData) => {
    const location = parseCoordinates(contact.LocationGpsCoordinates ?? '');
    const picked: Parameters<ContactPickerProps['onSelect']>[0] = { contactId: contact.ContactId, name: contactDisplayName(contact), info: contactReachInfo(contact), address: contact.Address?.trim() || undefined };

    if (location.ok) {
      picked.latitude = location.latitude;
      picked.longitude = location.longitude;
    }

    onSelect(picked);
  };

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('calls.contact_picker.select')} testID="call-contact-picker">
      <View style={styles.panel}>
        <Input variant="outline" size="sm" className="mb-2">
          <InputField value={query} onChangeText={setQuery} placeholder={t('calls.contact_picker.search_placeholder')} accessibilityLabel={t('calls.contact_picker.search_placeholder')} testID="call-contact-search" />
        </Input>
        {isLoading && contacts.length === 0 ? <Spinner /> : null}
        {!isLoading && visible.length === 0 ? <Text className="py-4 text-center text-typography-500">{t('calls.contact_picker.empty')}</Text> : null}
        {visible.map((contact) => {
          const name = contactDisplayName(contact);
          const info = contactReachInfo(contact);

          return (
            <Pressable
              key={contact.ContactId}
              onPress={() => pick(contact)}
              accessibilityRole="button"
              accessibilityLabel={info ? `${name}, ${info}` : name}
              testID={`call-contact-${contact.ContactId}`}
              className="border-b border-outline-100 py-3"
            >
              <Text className="font-medium text-typography-900">{name}</Text>
              {info ? (
                <Text size="xs" className="text-typography-500">
                  {info}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </CallModalFrame>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
});
