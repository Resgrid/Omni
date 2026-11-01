import React from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

export type ModeType = 'light' | 'dark' | 'system';
export type ResolvedColorScheme = 'light' | 'dark';

interface ColorSchemeContextValue {
  mode: ModeType;
  scheme: ResolvedColorScheme;
}

/**
 * Published by GluestackUIProvider. On web, react-native-web's `useColorScheme()` follows only the
 * media query, so an explicit Light/Dark choice is invisible to it; this context is the source of truth
 * for the resolved scheme on every platform.
 */
export const ColorSchemeContext = React.createContext<ColorSchemeContextValue | null>(null);

/** Resolves a mode against the OS scheme. */
export function resolveColorScheme(mode: ModeType, osScheme: string | null | undefined): ResolvedColorScheme {
  if (mode === 'system') {
    return osScheme === 'dark' ? 'dark' : 'light';
  }
  return mode;
}

/** The scheme the UI is currently drawn in ('light' | 'dark'). Works with or without GluestackUIProvider. */
export function useResolvedColorScheme(): ResolvedColorScheme {
  const context = React.useContext(ColorSchemeContext);
  const osScheme = useRNColorScheme();
  return context ? context.scheme : osScheme === 'dark' ? 'dark' : 'light';
}

export function ColorSchemeProvider({ mode, children }: { mode: ModeType; children?: React.ReactNode }) {
  const osScheme = useRNColorScheme();
  const scheme = resolveColorScheme(mode, osScheme);
  const value = React.useMemo(() => ({ mode, scheme }), [mode, scheme]);
  return <ColorSchemeContext.Provider value={value}>{children}</ColorSchemeContext.Provider>;
}
