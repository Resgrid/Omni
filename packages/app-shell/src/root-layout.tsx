import { Stack } from 'expo-router';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Root layout shared by every variant (omni-plan §5.4). Phase 0 keeps it minimal; Phase 2 adds the
 * provider stack, ShellGate, createAppShell and the nav registry.
 */
export function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
