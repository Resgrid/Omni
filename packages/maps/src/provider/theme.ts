import type { MapColorScheme } from '../types';

/**
 * Colours for the map package's own chrome (sheets, banners, pickers). `@resgrid/maps` is layer L3 and cannot import
 * `@resgrid/ui` (L5), so the app shell passes its theme in through `MapProvider` (`theme` built from `useThemeColors()`);
 * these defaults match the gluestack light/dark neutrals.
 */
export interface MapThemeColors {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  border: string;
  primary: string;
  onPrimary: string;
  danger: string;
  /** Translucent backdrop behind floating labels on the map. */
  overlay: string;
  onOverlay: string;
}

export const LIGHT_MAP_THEME: MapThemeColors = {
  background: '#ffffff',
  surface: '#f3f4f6',
  text: '#111827',
  mutedText: '#4b5563',
  border: '#e5e7eb',
  primary: '#3b82f6',
  onPrimary: '#ffffff',
  danger: '#dc2626',
  overlay: 'rgba(0, 0, 0, 0.72)',
  onOverlay: '#ffffff',
};

export const DARK_MAP_THEME: MapThemeColors = {
  background: '#111827',
  surface: '#1f2937',
  text: '#f9fafb',
  mutedText: '#d1d5db',
  border: '#374151',
  primary: '#60a5fa',
  onPrimary: '#0b1220',
  danger: '#f87171',
  overlay: 'rgba(17, 24, 39, 0.92)',
  onOverlay: '#f9fafb',
};

export const resolveMapTheme = (scheme: MapColorScheme, overrides?: Partial<MapThemeColors>): MapThemeColors => ({
  ...(scheme === 'dark' ? DARK_MAP_THEME : LIGHT_MAP_THEME),
  ...overrides,
});
