import { Stack } from 'expo-router';
import React from 'react';

/**
 * A header-less stack for a feature folder inside `(app)` (`records/_layout.tsx`: `export { ShellStack as default } from
 * '@resgrid/app-shell'`). The shell header titles and backs its screens; in a tabs shell the folder is one tab route.
 */
export function ShellStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
