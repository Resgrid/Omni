import { useTranslation } from '@resgrid/i18n';
import { Text } from '@resgrid/ui';
import { Shield } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface DetailRowProps {
  label: string;
  /** null = withheld by Advanced Data Protection (shows "Protected"); undefined/'' = row hidden. */
  value: string | null | undefined;
  isProtected?: boolean;
  testID?: string;
}

/** A label/value row; protected values render a shield and "Protected", never the REDACTED sentinel. */
export const DetailRow: React.FC<DetailRowProps> = ({ label, value, isProtected = false, testID }) => {
  const { t } = useTranslation();
  if (!isProtected && !value) return null;
  return (
    <View style={styles.row} testID={testID} accessible accessibilityLabel={`${label}: ${isProtected ? t('data_protection.protected_value') : (value ?? '')}`}>
      <Text size="sm" className="text-typography-500">
        {label}
      </Text>
      {isProtected ? (
        <View style={styles.protected}>
          <View style={styles.icon}>
            <Shield size={14} color="#6B7280" />
          </View>
          <Text className="italic text-typography-500">{t('data_protection.protected_value')}</Text>
        </View>
      ) : (
        <Text className="text-typography-900" selectable>
          {value}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { paddingVertical: 6 },
  protected: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 4 },
});
