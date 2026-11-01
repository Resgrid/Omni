import { Divider, Heading, Pressable, Text, useFormFactor } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

/** Readable column width on tablets, desktop/Electron windows and wall boards; phones use the full width. */
export const CONTENT_MAX_WIDTH = 960;

/** Centres a screen's content and caps its width on large form factors. */
export const ContentFrame: React.FC<{ children: React.ReactNode; maxWidth?: number }> = ({ children, maxWidth = CONTENT_MAX_WIDTH }) => {
  const { isPhone } = useFormFactor();
  return <View style={isPhone ? styles.full : StyleSheet.flatten([styles.full, styles.centered, { maxWidth }])}>{children}</View>;
};

/** A titled list section (Records home, deployment detail). Module-level so re-renders keep the same component type. */
export const RecordsSection: React.FC<{ title: string; children: React.ReactNode; testID?: string }> = ({ title, children, testID }) => (
  <View style={styles.section} testID={testID}>
    <Heading size="xs" className="px-4 pb-1 pt-3 uppercase text-typography-500" accessibilityRole="header">
      {title}
    </Heading>
    {children}
    <Divider />
  </View>
);

export const EmptyRow: React.FC<{ text: string; testID?: string }> = ({ text, testID }) => (
  <Text size="sm" className="px-4 py-3 text-typography-500" testID={testID}>
    {text}
  </Text>
);

/** A coloured notice box (warning / error / info). */
export const Notice: React.FC<{ tone: 'warning' | 'error' | 'info'; children: React.ReactNode; testID?: string }> = ({ tone, children, testID }) => (
  <View
    className={`mx-4 mt-3 rounded-md border p-3 ${tone === 'error' ? 'border-error-300 bg-background-error' : tone === 'warning' ? 'border-warning-300 bg-background-warning' : 'border-info-300 bg-background-info'}`}
    accessibilityRole={tone === 'error' ? 'alert' : undefined}
    testID={testID}
  >
    {children}
  </View>
);

/** A label/value row; renders nothing without a value. */
export const DetailRow: React.FC<{ label: string; value?: string | null; testID?: string }> = ({ label, value, testID }) =>
  value ? (
    <View style={styles.detailRow}>
      <Text size="xs" className="text-typography-500">
        {label}
      </Text>
      <Text size="xs" className="ml-3 flex-1 text-right text-typography-800" numberOfLines={2} testID={testID}>
        {value}
      </Text>
    </View>
  ) : null;

export interface CheckRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/** A web/Electron-safe checkbox row (checkbox role, no portal). */
export const CheckRow: React.FC<CheckRowProps> = ({ label, checked, onChange, disabled = false, testID }) => (
  <Pressable
    onPress={() => (disabled ? undefined : onChange(!checked))}
    accessibilityRole="checkbox"
    accessibilityState={{ checked, disabled }}
    accessibilityLabel={label}
    disabled={disabled}
    testID={testID}
    className={`flex-row items-center py-2 ${disabled ? 'opacity-50' : ''}`}
  >
    <View className={`mr-2 items-center justify-center rounded border ${checked ? 'border-primary-600 bg-primary-600' : 'border-outline-400 bg-background-0'}`} style={styles.box}>
      {checked ? <Check size={14} color="#FFFFFF" /> : null}
    </View>
    <Text size="sm" className="flex-1 text-typography-800">
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  full: { width: '100%' },
  centered: { alignSelf: 'center' },
  section: { marginBottom: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 4 },
  box: { width: 20, height: 20 },
});
