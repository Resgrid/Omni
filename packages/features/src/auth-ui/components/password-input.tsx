import { useTranslation } from '@resgrid/i18n';
import { Input, InputField, InputSlot, useThemeColors } from '@resgrid/ui';
import { Eye, EyeOff } from 'lucide-react-native';
import React, { useState } from 'react';
import type { TextInputProps } from 'react-native';
import { View } from 'react-native';

export interface PasswordInputProps {
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  accessibilityLabel: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  /** Off on a shared installation, so the next operator's device never offers the last one's password. */
  autoComplete?: TextInputProps['autoComplete'];
  testID?: string;
}

/** A password field with Unit's show/hide toggle, labelled and re-exposed to VoiceOver (gluestack's Slot hides itself by default). */
export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChangeText,
  onBlur,
  onSubmitEditing,
  placeholder,
  accessibilityLabel,
  isDisabled,
  isInvalid,
  autoComplete = 'current-password',
  testID = 'password-input',
}) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [visible, setVisible] = useState(false);
  return (
    <Input isDisabled={isDisabled} isInvalid={isInvalid}>
      <InputField
        type={visible ? 'text' : 'password'}
        secureTextEntry={!visible}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        returnKeyType="done"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={autoComplete === 'off' ? 'none' : 'password'}
        accessibilityLabel={accessibilityLabel}
        aria-label={accessibilityLabel}
        testID={testID}
      />
      <InputSlot
        onPress={() => setVisible((current) => !current)}
        className="pr-3"
        accessibilityRole="button"
        accessibilityLabel={visible ? t('login.hide_password') : t('login.show_password')}
        accessibilityElementsHidden={false}
        importantForAccessibility="yes"
        testID={`${testID}-toggle`}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {visible ? <Eye size={18} color={colors.icon} /> : <EyeOff size={18} color={colors.icon} />}
        </View>
      </InputSlot>
    </Input>
  );
};
