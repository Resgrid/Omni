import { Box, KeyboardAvoidingView, ScrollView, useFormFactor } from '@resgrid/ui';
import React from 'react';
import { StyleSheet } from 'react-native';

export interface AuthLayoutProps {
  children: React.ReactNode;
  /** Shown above the form (logo, title). */
  header?: React.ReactNode;
  testID?: string;
}

/**
 * The sign-in screens' frame on iOS and Android: one centred column, keyboard-aware, capped at a readable width on tablets.
 * The web/Electron frame (`auth-layout.web.tsx`) adds Dispatch's branding panel on wide screens.
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, header, testID = 'auth-layout' }) => {
  const { isPhone } = useFormFactor();
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={10}>
      <ScrollView className="bg-background-0" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} testID={testID}>
        <Box className={`w-full self-center p-4 ${isPhone ? '' : 'max-w-lg'}`}>
          {header ?? null}
          {children}
        </Box>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center' },
});
