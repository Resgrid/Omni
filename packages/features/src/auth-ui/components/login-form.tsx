import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, FormControl, FormControlError, FormControlErrorText, FormControlLabel, FormControlLabelText, Input, InputField, VStack } from '@resgrid/ui';
import React, { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard } from 'react-native';
import { z } from 'zod';

import { InlineError } from './inline-error';
import { PasswordInput } from './password-input';

export interface LoginFormValues {
  username: string;
  password: string;
}

export interface LoginFormProps {
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
  isLoading?: boolean;
  /** The translated reason the last sign-in failed. */
  error?: string | null;
  /** A shared installation: no autofill, so the next operator is never offered the last one's credentials. */
  sharedDevice?: boolean;
}

/**
 * Username and password (Responder form + Unit's password toggle and accessibility). Validation messages are translated;
 * a password is only required, never length-checked, so an older account's password still works.
 */
export const LoginForm: React.FC<LoginFormProps> = ({ onSubmit, isLoading = false, error = null, sharedDevice = false }) => {
  const { t } = useTranslation();
  const schema = useMemo(
    () =>
      z.object({
        username: z.string().trim().min(1, t('login.username_required')).min(3, t('login.username_too_short')),
        password: z.string().min(1, t('login.password_required')),
      }),
    [t]
  );
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } });

  const submit = handleSubmit(async (values) => {
    Keyboard.dismiss();
    await onSubmit({ username: values.username.trim(), password: values.password });
  });

  return (
    <VStack space="md" className="w-full">
      <FormControl isInvalid={!!errors.username} isDisabled={isLoading}>
        <FormControlLabel>
          <FormControlLabelText>{t('login.username')}</FormControlLabelText>
        </FormControlLabel>
        <Controller
          name="username"
          control={control}
          render={({ field: { onChange, onBlur, value } }) => (
            <Input isInvalid={!!errors.username}>
              <InputField
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={t('login.username_placeholder')}
                returnKeyType="next"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={sharedDevice ? 'off' : 'username'}
                textContentType={sharedDevice ? 'none' : 'username'}
                accessibilityLabel={t('login.username')}
                aria-label={t('login.username')}
                testID="login-username"
              />
            </Input>
          )}
        />
        <FormControlError>
          <FormControlErrorText testID="login-username-error">{errors.username?.message}</FormControlErrorText>
        </FormControlError>
      </FormControl>

      <FormControl isInvalid={!!errors.password} isDisabled={isLoading}>
        <FormControlLabel>
          <FormControlLabelText>{t('login.password')}</FormControlLabelText>
        </FormControlLabel>
        <Controller
          name="password"
          control={control}
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              onSubmitEditing={() => void submit()}
              placeholder={t('login.password_placeholder')}
              accessibilityLabel={t('login.password')}
              isInvalid={!!errors.password}
              isDisabled={isLoading}
              autoComplete={sharedDevice ? 'off' : 'current-password'}
              testID="login-password"
            />
          )}
        />
        <FormControlError>
          <FormControlErrorText testID="login-password-error">{errors.password?.message}</FormControlErrorText>
        </FormControlError>
      </FormControl>

      <InlineError message={error} testID="login-error-message" />

      <Button action="primary" className="mt-2 w-full" onPress={() => void submit()} isDisabled={isLoading} accessibilityLabel={t('login.login_button')} accessibilityState={{ busy: isLoading }} testID="login-submit">
        {isLoading ? (
          <>
            <ButtonSpinner />
            <ButtonText className="ml-2">{t('login.login_button_loading')}</ButtonText>
          </>
        ) : (
          <ButtonText>{t('login.login_button')}</ButtonText>
        )}
      </Button>
    </VStack>
  );
};
