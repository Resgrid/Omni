import { isFieldRedacted } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Text } from '@resgrid/ui';
import { LockIcon } from 'lucide-react-native';
import React from 'react';

export interface ProtectedLabelProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  testID?: string;
}

/** The shield/lock label shown in place of a withheld value. Never the wire sentinel "REDACTED". */
export const ProtectedLabel: React.FC<ProtectedLabelProps> = ({ size = 'md', testID = 'protected-label' }) => {
  const { t } = useTranslation();
  return (
    <HStack space="xs" className="items-center" testID={testID} accessibilityLabel={t('data_protection.protected_value')}>
      <LockIcon size={size === 'xs' || size === 'sm' ? 12 : 14} color="#6b7280" />
      <Text size={size} className="italic text-typography-500">
        {t('data_protection.protected_value')}
      </Text>
    </HStack>
  );
};

export interface ProtectedTextProps {
  /** The value as the server returned it. */
  value?: string | null;
  /** Catalog field id, e.g. ProtectedFieldIds.contactEmail. */
  fieldId: string;
  /** The RedactedFields list from the same record (authoritative; the sentinel is the fallback when absent). */
  redactedFields?: readonly (string | null)[] | null;
  /** Rendered when the value is present and not withheld; defaults to the value as text. */
  children?: React.ReactNode;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  testID?: string;
}

/**
 * One protected field. A withheld value renders as a lock and "Protected" — the literal "REDACTED" is a wire sentinel,
 * not copy: shown raw it reads as data and gives no hint that it can be revealed. Everything else passes straight
 * through, so it is safe on fields that are only sometimes protected and on departments without the add-on.
 */
export const ProtectedText: React.FC<ProtectedTextProps> = ({ value, fieldId, redactedFields, children, className, size = 'md', testID }) => {
  if (isFieldRedacted(redactedFields, fieldId, value)) {
    return <ProtectedLabel size={size} testID={testID ?? `protected-field-${fieldId}`} />;
  }
  if (children) return <>{children}</>;
  return (
    <Text size={size} className={className} testID={testID}>
      {value ?? ''}
    </Text>
  );
};
