import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, Input, InputField, Text, Textarea, TextareaInput } from '@resgrid/ui';
import React from 'react';
import { type KeyboardTypeOptions, ScrollView, StyleSheet, View } from 'react-native';

export interface SheetFormProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Primary action label; omit for a sheet without a footer save (pickers). */
  submitLabel?: string;
  onSubmit?: () => void;
  isSubmitDisabled?: boolean;
  submitAction?: 'primary' | 'negative';
  snapPoint?: number;
  children: React.ReactNode;
  testID: string;
}

/** A bottom-sheet form with a title, scrolling body and Cancel / primary footer (every board sheet). */
export const SheetForm: React.FC<SheetFormProps> = ({ isOpen, onClose, title, description, submitLabel, onSubmit, isSubmitDisabled = false, submitAction = 'primary', snapPoint = 75, children, testID }) => {
  const { t } = useTranslation();
  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[snapPoint]} testID={testID}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text className="text-center text-lg font-bold text-typography-900" accessibilityRole="header">
          {title}
        </Text>
        {description ? <Text className="mb-2 mt-1 text-center text-sm text-typography-500">{description}</Text> : null}
        <View style={styles.body}>{children}</View>
        {submitLabel && onSubmit ? (
          <View style={styles.actions}>
            <Button variant="outline" className="mr-2 flex-1" onPress={onClose} accessibilityLabel={t('common.cancel')} testID={`${testID}-cancel`}>
              <ButtonText>{t('common.cancel')}</ButtonText>
            </Button>
            <Button className="ml-2 flex-1" action={submitAction} onPress={onSubmit} isDisabled={isSubmitDisabled} accessibilityLabel={submitLabel} testID={`${testID}-submit`}>
              <ButtonText>{submitLabel}</ButtonText>
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </CustomBottomSheet>
  );
};

export const FieldLabel: React.FC<{ text: string; optional?: boolean }> = ({ text, optional = false }) => {
  const { t } = useTranslation();
  return (
    <Text size="sm" className="mb-1 mt-3 font-medium text-typography-700">
      {optional ? `${text} (${t('common.optional')})` : text}
    </Text>
  );
};

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  optional?: boolean;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  testID: string;
}

export const TextField: React.FC<TextFieldProps> = ({ label, value, onChangeText, placeholder, optional, multiline = false, keyboardType, testID }) => (
  <View>
    <FieldLabel text={label} optional={optional} />
    {multiline ? (
      <Textarea size="md">
        <TextareaInput value={value} onChangeText={onChangeText} placeholder={placeholder} accessibilityLabel={label} testID={testID} />
      </Textarea>
    ) : (
      <Input size="md" variant="outline">
        <InputField value={value} onChangeText={onChangeText} placeholder={placeholder} accessibilityLabel={label} keyboardType={keyboardType} testID={testID} />
      </Input>
    )}
  </View>
);

/** A non-negative whole number from a text field ('' → fallback). */
export const parseCount = (value: string, fallback = 0): number => {
  const parsed = parseInt(value.replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(parsed) ? fallback : Math.max(0, parsed);
};

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  body: { paddingBottom: 8 },
  actions: { flexDirection: 'row', marginTop: 16, marginBottom: 8 },
});
