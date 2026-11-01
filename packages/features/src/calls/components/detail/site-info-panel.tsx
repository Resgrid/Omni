import { isRedactedValue } from '@resgrid/auth';
import { useCallDetailStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallSiteContactData } from '@resgrid/models';
import { Loading, Text } from '@resgrid/ui';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

export interface SiteInfoPanelProps {
  callId: string;
}

const SEVERITY_COLORS: Record<number, string> = { 0: '#2563EB', 1: '#D97706', 2: '#DC2626' };

/**
 * Pre-plans, hazards, alert notes and files of the contacts linked to the call (R/U site info panel). Online read;
 * signed file links expire and are never persisted (GetCallSiteInfo contract).
 */
export const SiteInfoPanel: React.FC<SiteInfoPanelProps> = ({ callId }) => {
  const { t } = useTranslation();
  const siteInfo = useCallDetailStore((state) => state.details[callId]?.siteInfo);
  const isLoading = useCallDetailStore((state) => state.loading.siteInfo === true);
  const error = useCallDetailStore((state) => state.errors.siteInfo);
  const fetchSiteInfo = useCallDetailStore((state) => state.fetchCallSiteInfo);

  useEffect(() => {
    void fetchSiteInfo(callId);
  }, [callId, fetchSiteInfo]);

  if (isLoading && !siteInfo) return <Loading text={t('site_info.loading')} />;
  if (error && !siteInfo) {
    return (
      <View style={styles.panel} testID="site-info-panel">
        <Text className="text-error-600">{t('site_info.load_failed')}</Text>
      </View>
    );
  }
  const contacts = siteInfo?.Contacts ?? [];
  if (contacts.length === 0) {
    return (
      <View style={styles.panel} testID="site-info-panel">
        <Text className="text-typography-700">{t('site_info.empty')}</Text>
        <Text size="sm" className="text-typography-500">
          {t('site_info.empty_description')}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.panel} testID="site-info-panel">
      {contacts.map((contact) => (
        <SiteContact key={contact.ContactId} contact={contact} />
      ))}
    </View>
  );
};

const SiteContact: React.FC<{ contact: CallSiteContactData }> = ({ contact }) => {
  const { t } = useTranslation();
  const protectedLabel = t('data_protection.protected_value');
  return (
    <View style={styles.contact} className="bg-background-50" testID={`site-contact-${contact.ContactId}`}>
      <Text className="font-semibold text-typography-900">{isRedactedValue(contact.Name) ? protectedLabel : contact.Name}</Text>
      <Text size="xs" className="text-typography-500">
        {contact.CallContactType === 0 ? t('site_info.primary_contact') : t('site_info.additional_contact')}
      </Text>
      {contact.PhoneNumber ? (
        <Text size="sm" className="text-typography-700">
          {isRedactedValue(contact.PhoneNumber) ? protectedLabel : contact.PhoneNumber}
        </Text>
      ) : null}
      {contact.EntranceGpsCoordinates ? (
        <Text size="xs" className="text-typography-600">
          {`${t('site_info.entrance')}: ${contact.EntranceGpsCoordinates}`}
        </Text>
      ) : null}
      {contact.Hazards.map((hazard) => (
        <View
          key={hazard.ContactPreplanHazardId}
          style={StyleSheet.flatten([styles.hazard, { borderLeftColor: SEVERITY_COLORS[hazard.Severity] ?? '#6B7280' }])}
          accessible
          accessibilityLabel={`${hazard.SeverityName}: ${hazard.Title}`}
        >
          <Text size="sm" className="font-semibold text-typography-900">
            {`${hazard.SeverityName} · ${hazard.HazardTypeName}`}
          </Text>
          <Text size="sm" className="text-typography-700">
            {hazard.Title}
          </Text>
        </View>
      ))}
      {contact.AlertNotes.length > 0 ? (
        <View style={styles.section}>
          <Text size="sm" className="font-semibold text-typography-900">
            {t('site_info.alert_notes')}
          </Text>
          {contact.AlertNotes.map((note) => (
            <Text key={note.ContactNoteId} size="sm" className="text-typography-700">
              {isRedactedValue(note.Note) ? protectedLabel : note.Note}
            </Text>
          ))}
        </View>
      ) : null}
      {contact.Attachments.length > 0 ? (
        <View style={styles.section}>
          <Text size="sm" className="font-semibold text-typography-900">
            {t('site_info.files')}
          </Text>
          {contact.Attachments.map((file) => (
            <Text key={file.Id} size="sm" className="text-typography-700">
              {file.Name || file.FileName}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  contact: { borderRadius: 8, padding: 12, marginBottom: 12 },
  hazard: { borderLeftWidth: 4, paddingLeft: 8, marginTop: 8 },
  section: { marginTop: 8 },
});
