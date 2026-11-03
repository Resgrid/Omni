import { useTranslation } from '@resgrid/i18n';
import { HStack, Text, View } from '@resgrid/ui';
import React from 'react';

export interface FormFieldProps {
  /** Shown above the input; leave it out for a control that labels itself (DateTimeField). */
  label?: string;
  /** Shows "Optional" after the label. */
  optional?: boolean;
  /** Guidance under the field; replaced by the error when there is one. */
  hint?: string | null;
  /** What is wrong with the value, already translated. */
  error?: string | null;
  /** The last field in its card: no space below it. */
  last?: boolean;
  children: React.ReactNode;
  testID?: string;
}

/** A labelled form field: label above, the input, then its error (red) or a hint (muted) below. */
export const FormField: React.FC<FormFieldProps> = ({ label, optional = false, hint, error, last = false, children, testID }) => {
  const { t } = useTranslation();
  return (
    <View className={last ? '' : 'mb-4'} testID={testID}>
      {label ? (
        <HStack space="xs" className="mb-1.5 items-baseline">
          <Text size="sm" className="font-medium text-typography-800">
            {label}
          </Text>
          {optional ? (
            <Text size="xs" className="text-typography-500">
              {t('certifications.form.optional')}
            </Text>
          ) : null}
        </HStack>
      ) : null}
      {children}
      {error ? (
        <Text size="sm" className="mt-1 text-error-600" accessibilityRole="alert" testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : hint ? (
        <Text size="sm" className="mt-1 text-typography-500" testID={testID ? `${testID}-hint` : undefined}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
};
