import { FormFactorProvider, GluestackUIProvider, ToastContainer, useResolvedColorScheme } from '@resgrid/ui';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import React, { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getAppShellOptions } from '../runtime/shell-config';
import { useShellStore } from '../runtime/shell-state';
import { ShellInboxProvider } from './inbox-provider';
import { PushNotificationModalHost } from './push-modal-host';

/** React Navigation's theme follows the resolved scheme (must sit inside GluestackUIProvider, which publishes it). */
function NavigationTheme({ children }: { children?: ReactNode }) {
  const scheme = useResolvedColorScheme();
  return <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>{children}</ThemeProvider>;
}

/**
 * The one provider order for every variant (omni-plan §5.4): GestureHandlerRootView → KeyboardProvider →
 * SafeAreaProvider → FormFactorProvider → GluestackUIProvider (stored theme) → navigation theme → Novu inbox provider
 * (always mounted) → app, with the push modal and toast hosts drawn above it. No flash-message, no gorhom.
 */
export function RootProviders({ children }: { children?: ReactNode }) {
  // The user's choice, not the resolved scheme: handing the provider 'light'/'dark' pinned Appearance and a 'system'
  // choice stopped following the OS (Responder).
  const themeMode = useShellStore((state) => state.themeMode);
  const kiosk = getAppShellOptions().kiosk;

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <FormFactorProvider kiosk={kiosk}>
            <GluestackUIProvider mode={themeMode}>
              <NavigationTheme>
                <ShellInboxProvider>{children}</ShellInboxProvider>
              </NavigationTheme>
              <PushNotificationModalHost />
              <ToastContainer />
            </GluestackUIProvider>
          </FormFactorProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
