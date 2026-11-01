import { isFieldRedacted } from '@resgrid/auth';
import { logger } from '@resgrid/core/logging/logger';
import { ProtectedLabel } from '@resgrid/features/data-protection';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import React, { useCallback } from 'react';
import { Linking } from 'react-native';

import { type ContactAction, contactActionUrl, parseCoordinates } from '../lib/contact-format';
import { useNavigationHandoff } from '../navigation-handoff';

export type ContactFieldAction = ContactAction | 'address' | 'coordinates' | 'none';

export interface ContactFieldProps {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
  action?: ContactFieldAction;
  /** Catalog field id and the record's RedactedFields: a withheld value shows the protected label, never a link. */
  fieldId?: string;
  redactedFields?: readonly (string | null)[] | null;
  testID?: string;
}

/**
 * One contact detail with tap-to-act (U/I baseline): call, email, open a website, or hand an address or "lat,lng" to
 * the navigation app. A withheld value is never actionable ("tel:REDACTED"); empty values render nothing.
 */
export const ContactField: React.FC<ContactFieldProps> = ({ label, value, icon, action = 'none', fieldId, redactedFields, testID }) => {
  const { t } = useTranslation();
  const handoff = useNavigationHandoff();
  const redacted = fieldId ? isFieldRedacted(redactedFields, fieldId, value) : value === 'REDACTED';
  const text = value?.toString().trim() ?? '';

  const handlePress = useCallback(async () => {
    if (redacted || !text) return;
    if (action === 'address' || action === 'coordinates') {
      const coordinates = parseCoordinates(text);
      await handoff.navigateTo(coordinates ? { ...coordinates, label } : { address: text, label });
      return;
    }
    if (action === 'none') return;
    const url = contactActionUrl(action, text);
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch (error) {
      // The URL holds the contact's details: log only the action.
      logger.warn({ message: 'Could not open a contact action', context: { action, error: error instanceof Error ? error.message : 'unknown' } });
    }
  }, [action, handoff, label, redacted, text]);

  if (!redacted && !text) return null;

  const content = (
    <HStack space="md" className="items-start py-2">
      {icon ? <View className="size-6 items-center justify-center">{icon}</View> : null}
      <VStack space="xs" className="flex-1">
        <Text className="text-sm text-typography-500">{label}</Text>
        {redacted ? <ProtectedLabel testID={testID ? `${testID}-protected` : undefined} /> : <Text className={`text-base ${action === 'none' ? 'text-typography-900' : 'text-primary-600'}`}>{text}</Text>}
      </VStack>
    </HStack>
  );

  return action !== 'none' && !redacted ? (
    <Pressable onPress={() => void handlePress()} accessibilityRole="button" accessibilityLabel={`${label}, ${text}`} accessibilityHint={t(`contacts.action_hint.${action}`)} testID={testID}>
      {content}
    </Pressable>
  ) : (
    <View testID={testID}>{content}</View>
  );
};
