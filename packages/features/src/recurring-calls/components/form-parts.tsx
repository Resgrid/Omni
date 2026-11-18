import { Input, InputField, Switch, Text, Textarea, TextareaInput } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

/** A titled block of the recurring call form. */
export const FormSection: React.FC<{ title: string; description?: string | null; children: React.ReactNode; testID: string }> = ({ title, description = null, children, testID }) => (
  <View style={styles.section} className="bg-background-0" testID={testID}>
    <Text className="mb-1 font-semibold text-typography-900" accessibilityRole="header">
      {title}
    </Text>
    {description ? (
      <Text size="xs" className="mb-2 text-typography-500">
        {description}
      </Text>
    ) : null}
    {children}
  </View>
);

export interface FormTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'email-address' | 'phone-pad';
  maxLength?: number;
  /** Shown under the field (already translated). */
  error?: string | null;
  testID: string;
}

/** A labelled one-line or multi-line text field. */
export const FormTextField: React.FC<FormTextFieldProps> = ({ label, value, onChange, placeholder, multiline = false, keyboardType = 'default', maxLength, error = null, testID }) => (
  <View style={styles.field}>
    <Text size="sm" className="mb-1 text-typography-700">
      {label}
    </Text>
    {multiline ? (
      <Textarea size="md" isInvalid={!!error}>
        <TextareaInput value={value} onChangeText={onChange} placeholder={placeholder} accessibilityLabel={label} maxLength={maxLength} testID={testID} />
      </Textarea>
    ) : (
      <Input variant="outline" isInvalid={!!error}>
        <InputField value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={keyboardType} accessibilityLabel={label} maxLength={maxLength} autoCorrect={keyboardType === 'default'} testID={testID} />
      </Input>
    )}
    {error ? <FieldError message={error} testID={`${testID}-error`} /> : null}
  </View>
);

/** A label with a switch; `hint` explains what it does (or why it is off). */
export const FormSwitchRow: React.FC<{ label: string; value: boolean; onChange: (value: boolean) => void; hint?: string | null; disabled?: boolean; testID: string }> = ({
  label,
  value,
  onChange,
  hint = null,
  disabled = false,
  testID,
}) => (
  <View style={styles.field}>
    <View style={styles.switchRow}>
      <Text className="flex-1 pr-3 text-typography-800">{label}</Text>
      <Switch value={value} onValueChange={onChange} isDisabled={disabled} accessibilityLabel={label} testID={testID} />
    </View>
    {hint ? (
      <Text size="xs" className="mt-1 text-typography-500" testID={`${testID}-hint`}>
        {hint}
      </Text>
    ) : null}
  </View>
);

/** An error under a field or section. */
export const FieldError: React.FC<{ message: string; testID?: string }> = ({ message, testID }) => (
  <Text size="xs" className="mt-1 text-error-600" testID={testID}>
    {message}
  </Text>
);

const styles = StyleSheet.create({
  section: { borderRadius: 12, padding: 12, marginBottom: 12 },
  field: { marginBottom: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});
