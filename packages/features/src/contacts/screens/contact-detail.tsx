import { isFieldRedacted, ProtectedFieldIds, REDACTION_VALUE } from '@resgrid/auth';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useContactsStore } from '@resgrid/data';
import { ProtectedRevealBar, ProtectedText } from '@resgrid/features/data-protection';
import { useTranslation } from '@resgrid/i18n';
import { type ContactResultData, ContactType } from '@resgrid/models';
import { Heading, HStack, Loading, Pressable, ScreenHeader, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Contact, GlobeIcon, MailIcon, MapPinIcon, PhoneIcon, SmartphoneIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';

import { ContactField } from '../components/contact-field';
import { ContactFilesPanel } from '../components/contact-files-panel';
import { ContactNotesList } from '../components/contact-notes-list';
import { ContactPreplanPanel } from '../components/contact-preplan-panel';
import { contactDisplayName, formatAddress, htmlToText, parseCoordinates } from '../lib/contact-format';

export type ContactDetailTab = 'details' | 'notes' | 'files' | 'preplan';

export interface ContactDetailScreenProps {
  contactId?: string;
  initialTab?: ContactDetailTab;
  /** Map slot (MapLibre via @resgrid/maps, supplied by the app) for the contact's location coordinates. */
  renderMap?: (coordinates: { latitude: number; longitude: number }, contact: ContactResultData) => React.ReactNode;
}

const TABS: { id: ContactDetailTab; key: string }[] = [
  { id: 'details', key: 'contacts.tabs.details' },
  { id: 'notes', key: 'contacts.tabs.notes' },
  { id: 'files', key: 'contacts.tabs.files' },
  { id: 'preplan', key: 'contacts.tabs.preplan' },
];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <VStack className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-3">
    <Text className="mb-1 font-semibold text-typography-900">{title}</Text>
    {children}
  </VStack>
);

/**
 * A contact (U/I detail + R additions + D files/pre-plan panels): tap-to-act details, coordinates handed to the
 * navigation app, notes, files and the pre-incident plan, with the protected-data reveal bar.
 */
export default function ContactDetailScreen({ contactId: contactIdProp, initialTab = 'details', renderMap }: ContactDetailScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = contactIdProp ?? (Array.isArray(params.id) ? params.id[0] : params.id);
  const contactId = isSafeRouteId(rawId) ? rawId : null;
  const [tab, setTab] = useState<ContactDetailTab>(initialTab);
  const detail = useContactsStore((state) => (contactId ? state.detailsById[contactId] : undefined));
  const listed = useContactsStore((state) => (contactId ? state.contacts.find((contact) => contact.ContactId === contactId) : undefined));
  const isLoading = useContactsStore((state) => state.loading.detail === true);
  const contact = detail ?? listed;

  useEffect(() => {
    if (contactId) void useContactsStore.getState().fetchContactDetails(contactId);
  }, [contactId]);

  const refresh = useCallback(async () => {
    if (!contactId) return;
    useContactsStore.getState().invalidateContact(contactId);
    await useContactsStore.getState().fetchContactDetails(contactId);
  }, [contactId]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/contacts'));

  if (!contact || !contactId) {
    return (
      <View className="flex-1 bg-background-50" testID="contact-detail-screen">
        <ScreenHeader title={t('contacts.details')} onBack={back} />
        {isLoading && contactId ? <Loading /> : <ZeroState icon={Contact} heading={t('contacts.not_found')} testID="contact-detail-missing" />}
      </View>
    );
  }

  const redacted = contact.RedactedFields;
  const isCompany = contact.ContactType === ContactType.Company;
  const name = contactDisplayName(contact);
  const nameFieldId = isCompany ? ProtectedFieldIds.contactCompanyName : ProtectedFieldIds.contactFirstName;
  const isNameWithheld = isFieldRedacted(redacted, nameFieldId, name) || name.includes(REDACTION_VALUE);
  const location = parseCoordinates(contact.LocationGpsCoordinates);
  const physical = formatAddress(contact.PhysicalAddress);
  const mailing = formatAddress(contact.MailingAddress);

  return (
    <View className="flex-1 bg-background-50" testID="contact-detail-screen">
      <ScreenHeader title={isNameWithheld ? t('contacts.details') : name} onBack={back} />
      <ProtectedRevealBar onRefresh={refresh} />
      <HStack space="sm" className="px-4 py-2">
        {TABS.map((item) => (
          <Pressable
            key={item.id}
            testID={`contact-tab-${item.id}`}
            onPress={() => setTab(item.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item.id }}
            className={`flex-1 items-center rounded-lg px-2 py-2 ${tab === item.id ? 'bg-primary-500' : 'bg-background-100'}`}
          >
            <Text className={`text-sm font-semibold ${tab === item.id ? 'text-typography-0' : 'text-typography-700'}`}>{t(item.key)}</Text>
          </Pressable>
        ))}
      </HStack>
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 32 }}>
        {tab === 'details' ? (
          <VStack>
            <VStack className="mb-3 items-center">
              <ProtectedText
                value={isNameWithheld ? REDACTION_VALUE : name}
                fieldId={nameFieldId}
                redactedFields={isNameWithheld ? [nameFieldId] : redacted}
                className="text-xl font-bold text-typography-900"
                testID="contact-detail-name"
              />
              {contact.CategoryName ? <Text className="text-sm text-typography-500">{contact.CategoryName}</Text> : null}
            </VStack>
            <Section title={t('contacts.contactInformation')}>
              <ContactField
                label={t('contacts.email')}
                value={contact.Email}
                action="email"
                icon={<MailIcon size={18} color="#6b7280" />}
                fieldId={ProtectedFieldIds.contactEmail}
                redactedFields={redacted}
                testID="contact-field-email"
              />
              <ContactField
                label={t('contacts.cellPhone')}
                value={contact.CellPhoneNumber}
                action="phone"
                icon={<SmartphoneIcon size={18} color="#6b7280" />}
                fieldId={ProtectedFieldIds.contactCellPhone}
                redactedFields={redacted}
                testID="contact-field-cell"
              />
              <ContactField
                label={t('contacts.homePhone')}
                value={contact.HomePhoneNumber}
                action="phone"
                icon={<PhoneIcon size={18} color="#6b7280" />}
                fieldId={ProtectedFieldIds.contactHomePhone}
                redactedFields={redacted}
                testID="contact-field-home"
              />
              <ContactField label={t('contacts.officePhone')} value={contact.OfficePhoneNumber} action="phone" icon={<PhoneIcon size={18} color="#6b7280" />} testID="contact-field-office" />
              <ContactField label={t('contacts.faxPhone')} value={contact.FaxPhoneNumber} testID="contact-field-fax" />
            </Section>
            <Section title={t('contacts.locationInformation')}>
              <ContactField label={t('contacts.physicalAddress')} value={physical} action="address" icon={<MapPinIcon size={18} color="#6b7280" />} testID="contact-field-physical" />
              <ContactField label={t('contacts.mailingAddress')} value={mailing} action="address" testID="contact-field-mailing" />
              <ContactField label={t('contacts.locationCoordinates')} value={contact.LocationGpsCoordinates} action="coordinates" testID="contact-field-location" />
              <ContactField label={t('contacts.entranceCoordinates')} value={contact.EntranceGpsCoordinates} action="coordinates" testID="contact-field-entrance" />
              <ContactField label={t('contacts.exitCoordinates')} value={contact.ExitGpsCoordinates} action="coordinates" testID="contact-field-exit" />
              {contact.LocationGeofence ? <Text className="text-xs text-typography-500">{t('contacts.hasGeofence')}</Text> : null}
              {location && renderMap ? <View className="mt-2 h-48 overflow-hidden rounded-lg">{renderMap(location, contact)}</View> : null}
            </Section>
            {contact.Website || contact.Twitter || contact.Facebook || contact.LinkedIn || contact.Instagram ? (
              <Section title={t('contacts.socialMediaWeb')}>
                <ContactField label={t('contacts.website')} value={contact.Website} action="website" icon={<GlobeIcon size={18} color="#6b7280" />} testID="contact-field-website" />
                <ContactField label={t('contacts.twitter')} value={contact.Twitter} />
                <ContactField label={t('contacts.facebook')} value={contact.Facebook} />
                <ContactField label={t('contacts.linkedin')} value={contact.LinkedIn} />
                <ContactField label={t('contacts.instagram')} value={contact.Instagram} />
              </Section>
            ) : null}
            {contact.Description || contact.OtherInfo || (contact.CustomFields ?? []).length > 0 ? (
              <Section title={t('contacts.additionalInformation')}>
                {contact.Description ? <Text className="mb-2 text-sm text-typography-900">{htmlToText(contact.Description)}</Text> : null}
                {contact.OtherInfo ? <Text className="mb-2 text-sm text-typography-900">{htmlToText(contact.OtherInfo)}</Text> : null}
                {(contact.CustomFields ?? [])
                  .slice()
                  .sort((a, b) => a.SortOrder - b.SortOrder)
                  .map((field) => (
                    <ContactField key={field.UdfFieldId} label={field.Label} value={field.DisplayValue ?? field.Value} />
                  ))}
              </Section>
            ) : null}
            <Section title={t('contacts.systemInformation')}>
              <ContactField label={t('contacts.addedOn')} value={[contact.AddedOn, contact.AddedByUserName].filter((part) => !!part).join(' • ')} />
              <ContactField label={t('contacts.editedOn')} value={[contact.EditedOn, contact.EditedByUserName].filter((part) => !!part).join(' • ')} />
            </Section>
          </VStack>
        ) : null}
        {tab === 'notes' ? <ContactNotesList contactId={contactId} /> : null}
        {tab === 'files' ? <ContactFilesPanel contactId={contactId} /> : null}
        {tab === 'preplan' ? (
          <VStack>
            <Heading size="sm" className="mb-2 text-typography-900">
              {t('contacts.tabs.preplan')}
            </Heading>
            <ContactPreplanPanel contactId={contactId} />
          </VStack>
        ) : null}
      </ScrollView>
    </View>
  );
}
