import { type StyleProp, StyleSheet, type TextStyle } from 'react-native';

export type TextSize = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';

/**
 * Tailwind's line height for each text size class, as a multiple of the font size (`tailwindcss/theme.css`). `text-2xs`
 * (`theme-tokens.css`) sets no line height, so text in it keeps the font's own.
 */
const LINE_HEIGHT_RATIO = {
  '2xs': undefined,
  xs: 1 / 0.75,
  sm: 1.25 / 0.875,
  base: 1.5,
  lg: 1.75 / 1.125,
  xl: 1.75 / 1.25,
  '2xl': 2 / 1.5,
  '3xl': 2.25 / 1.875,
  '4xl': 2.5 / 2.25,
  '5xl': 1,
  '6xl': 1,
} as const;

const SIZE_CLASSES = ['2xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'] as const;

type SizeClass = (typeof SIZE_CLASSES)[number];

/** The `size` prop's class (`textStyle` in ./styles). */
const SIZE_PROP_CLASS = { '2xs': '2xs', xs: 'xs', sm: 'sm', md: 'base', lg: 'lg', xl: 'xl', '2xl': '2xl', '3xl': '3xl', '4xl': '4xl', '5xl': '5xl', '6xl': '6xl' } as const satisfies Record<TextSize, SizeClass>;

/** Unprefixed `text-<size>` and `leading-*` classes (a `md:` or `web:` one does not apply on native at the base size). */
const CLASS_TOKEN = /(?:^|\s)(leading-\S+|text-\S+)(?=\s|$)/g;

/**
 * On native, react-native-css resolves a size class's line height against that class's font size, so text given an
 * inline `fontSize` keeps the class's line: an 11px badge count sat on the 24px line of `text-base` and slid out of its
 * pill, and 28px wall-card text was cut at the top. CSS on the web scales the line with the actual font size; this
 * returns the same line height for native — the class's ratio times the inline `fontSize`.
 *
 * `undefined` (keep what the class gives) when the style sets its own `lineHeight` or no `fontSize`, when the className
 * sets `leading-*`, or when the size class has no line height (`text-2xs`).
 */
export function inlineFontLineHeight(style: StyleProp<TextStyle>, size: TextSize, isSub: boolean, className: string | undefined): number | undefined {
  const flat = style ? StyleSheet.flatten(style) : undefined;
  const fontSize = flat?.fontSize;

  if (flat?.lineHeight !== undefined || fontSize === undefined || !Number.isFinite(fontSize)) {
    return undefined;
  }

  // `sub` and a className size come after `size` in the class list, and the last size class wins.
  let sizeClass: SizeClass = isSub ? 'xs' : SIZE_PROP_CLASS[size];

  for (const [, token] of (className ?? '').matchAll(CLASS_TOKEN)) {
    if (token.startsWith('leading-')) {
      return undefined;
    }

    sizeClass = SIZE_CLASSES.find((candidate) => token === `text-${candidate}`) ?? sizeClass;
  }

  const ratio = LINE_HEIGHT_RATIO[sizeClass];

  return ratio === undefined ? undefined : Math.round(fontSize * ratio * 100) / 100;
}
