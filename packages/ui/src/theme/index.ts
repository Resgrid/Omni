// The resolved colour scheme (light / dark) and the provider that publishes it.
export { ColorSchemeContext, ColorSchemeProvider, type ModeType, resolveColorScheme, type ResolvedColorScheme, useResolvedColorScheme } from './color-scheme';

// Raw token values, mirrored from apps/omni/theme-tokens.css.
export { darkTokens, lightTokens, type ThemeTokenMap, type ThemeTokenName, TOKEN_NAMES } from './tokens';

// Semantic theme colours and department colours made readable on the theme surface.
export {
  contentOnFill,
  contrastRatio,
  getThemeColors,
  MARK_CONTRAST,
  parseColor,
  readableOnSurface,
  TEXT_CONTRAST,
  THEME_SURFACES,
  type ThemeColors,
  type ThemeReadableColors,
  tintOf,
  useReadableColor,
  useThemeColors,
} from './use-theme-colors';
