import React from 'react';

import { type ResolvedColorScheme, useResolvedColorScheme } from './color-scheme';
import { darkTokens, lightTokens, type ThemeTokenMap, type ThemeTokenName } from './tokens';

export interface ThemeColors {
  scheme: ResolvedColorScheme;
  isDark: boolean;
  /** Every token for the active scheme, e.g. `tokens['primary-600']`. */
  tokens: ThemeTokenMap;
  /** A token as a colour string; with `alpha` (0–1) it is returned as `rgba(...)`. */
  token: (name: ThemeTokenName, alpha?: number) => string;

  // Semantic roles — use these instead of `isDark ? '#hex' : '#hex'` ternaries.
  /** Screen background (background-0). */
  background: string;
  /** Cards, sheets, panels (background-50). */
  surface: string;
  /** Raised/pressed surface, inputs (background-100). */
  surfaceRaised: string;
  /** Body text (typography-900). */
  text: string;
  /** Secondary text (typography-600). */
  textMuted: string;
  /** Placeholder / disabled text (typography-400). */
  textSubtle: string;
  /** Text on a filled primary/semantic surface (typography-0). */
  textInverse: string;
  /** Default icon stroke (typography-700). */
  icon: string;
  /** Hairlines and input borders (outline-200). */
  border: string;
  /** Stronger dividers (outline-300). */
  borderStrong: string;
  primary: string;
  primaryStrong: string;
  secondary: string;
  tertiary: string;
  error: string;
  warning: string;
  success: string;
  info: string;
  /** Translucent scrim behind overlays. */
  backdrop: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

/** Builds the colour set for a scheme. Pure — usable outside React (e.g. map style builders). */
export function getThemeColors(scheme: ResolvedColorScheme): ThemeColors {
  const tokens = scheme === 'dark' ? darkTokens : lightTokens;
  const token = (name: ThemeTokenName, alpha?: number): string => {
    const hex = tokens[name];
    if (alpha === undefined) {
      return hex;
    }
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
  };

  return {
    scheme,
    isDark: scheme === 'dark',
    tokens,
    token,
    background: tokens['background-0'],
    surface: tokens['background-50'],
    surfaceRaised: tokens['background-100'],
    text: tokens['typography-900'],
    textMuted: tokens['typography-600'],
    textSubtle: tokens['typography-400'],
    textInverse: tokens['typography-0'],
    icon: tokens['typography-700'],
    border: tokens['outline-200'],
    borderStrong: tokens['outline-300'],
    primary: tokens['primary-500'],
    primaryStrong: tokens['primary-600'],
    secondary: tokens['secondary-500'],
    tertiary: tokens['tertiary-500'],
    error: tokens['error-500'],
    warning: tokens['warning-500'],
    success: tokens['success-500'],
    info: tokens['info-500'],
    backdrop: scheme === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)',
  };
}

const cache: Partial<Record<ResolvedColorScheme, ThemeColors>> = {};

/**
 * Theme colours as plain strings for maps, SVG, WebView HTML and navigation themes — places a className
 * cannot reach. Values come from the same tokens as the Tailwind classes, so they follow dark mode and
 * any token change.
 */
export function useThemeColors(): ThemeColors {
  const scheme = useResolvedColorScheme();
  return React.useMemo(() => {
    const cached = cache[scheme];
    if (cached) {
      return cached;
    }
    const colors = getThemeColors(scheme);
    cache[scheme] = colors;
    return colors;
  }, [scheme]);
}
