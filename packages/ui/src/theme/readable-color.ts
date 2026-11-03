import { useMemo } from 'react';

import { type ResolvedColorScheme, useResolvedColorScheme } from './color-scheme';
import { darkTokens, lightTokens } from './tokens';

/*
 * Colours that come from the department or the server (status, staffing and priority colours) are drawn as text, dots
 * and borders on the app's own light or dark surface. A department picks them once, usually against a light page, so
 * black or near-black ("#000" for On Scene, dark grey for Standing By) disappears in dark mode and white or pale yellow
 * disappears in light mode. These helpers keep the hue and move the lightness just far enough to read (WCAG 2.x
 * contrast: 4.5:1 for text, 3:1 for marks), and pick black or white for anything drawn on top of such a colour
 * (Dispatch `lib/readable-color`).
 */

type Rgb = { r: number; g: number; b: number };

interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** The surfaces these colours sit on: rows and cards (background-50 in dark mode, white in light mode). */
export const THEME_SURFACES: Record<ResolvedColorScheme, string> = { light: lightTokens['background-0'], dark: darkTokens['background-50'] };

/** WCAG minimum contrast for normal text. */
export const TEXT_CONTRAST = 4.5;

/** WCAG minimum contrast for non-text marks (status dots, borders, icons). */
export const MARK_CONTRAST = 3;

const DARK_TEXT = lightTokens['typography-900'];
const LIGHT_TEXT = '#ffffff';

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa and rgb()/rgba(); null for anything else (names, label classes, empty). */
export const parseColor = (input: string | null | undefined): Rgb | null => {
  if (!input) return null;
  const value = input.trim();

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);

  if (hex?.[1]) {
    const digits = hex[1].length <= 4 ? hex[1].replace(/./g, (d) => d + d) : hex[1];

    return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16) };
  }

  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i.exec(value);

  if (rgb?.[1] && rgb[2] && rgb[3]) {
    return { r: clamp(Number(rgb[1]), 0, 255), g: clamp(Number(rgb[2]), 0, 255), b: clamp(Number(rgb[3]), 0, 255) };
  }

  return null;
};

const toHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b]
    .map((c) =>
      Math.round(clamp(c, 0, 255))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

const channel = (c: number): number => {
  const s = c / 255;

  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
const relativeLuminance = ({ r, g, b }: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio between two colours, 1 to 21; 1 when either cannot be parsed. */
export const contrastRatio = (a: string, b: string): number => {
  const ca = parseColor(a);
  const cb = parseColor(b);

  if (!ca || !cb) return 1;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);

  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const toHsl = ({ r, g, b }: Rgb): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;

  return { h: h / 6, s, l };
};

const hueToChannel = (p: number, q: number, t: number): number => {
  const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;

  if (tt < 1 / 6) return p + (q - p) * 6 * tt;

  if (tt < 1 / 2) return q;

  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;

  return p;
};

const fromHsl = (h: number, s: number, l: number): Rgb => {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return { r: hueToChannel(p, q, h + 1 / 3) * 255, g: hueToChannel(p, q, h) * 255, b: hueToChannel(p, q, h - 1 / 3) * 255 };
};

/**
 * The colour itself when it already reads on the scheme's surface; otherwise the same hue made lighter (dark mode) or
 * darker (light mode) until it reaches `minContrast`. Unparseable input comes back unchanged, so a caller's own
 * fallback still applies.
 */
export const readableOnSurface = (color: string | null | undefined, scheme: ResolvedColorScheme, minContrast: number = TEXT_CONTRAST, surface: string = THEME_SURFACES[scheme]): string => {
  if (!color) return color ?? '';
  const rgb = parseColor(color);

  if (!rgb || contrastRatio(toHex(rgb), surface) >= minContrast) return color;

  const { h, s, l } = toHsl(rgb);
  const towardLight = scheme === 'dark';

  for (let step = 1; step <= 50; step++) {
    const nextL = towardLight ? l + ((1 - l) * step) / 50 : l - (l * step) / 50;
    const candidate = toHex(fromHsl(h, s, nextL));

    if (contrastRatio(candidate, surface) >= minContrast) return candidate;
  }

  return towardLight ? LIGHT_TEXT : DARK_TEXT;
};

/** Near-black or white for text, icons or dots drawn on top of a fill in `background`, whichever contrasts more. */
export const contentOnFill = (background: string | null | undefined): string => {
  const rgb = parseColor(background);

  if (!rgb) return LIGHT_TEXT;
  const bg = toHex(rgb);

  return contrastRatio(DARK_TEXT, bg) >= contrastRatio(LIGHT_TEXT, bg) ? DARK_TEXT : LIGHT_TEXT;
};

/** A translucent wash of the colour (`alphaHex` 00-ff) for a pill or tile behind its own text; transparent if unparseable. */
export const tintOf = (color: string | null | undefined, alphaHex = '18'): string => {
  const rgb = parseColor(color);

  return rgb ? `${toHex(rgb)}${alphaHex}` : 'transparent';
};

export interface ThemeReadableColors {
  scheme: ResolvedColorScheme;
  /** A server or department colour adjusted to read as text on the current theme's surface (4.5:1). */
  text: (color: string | null | undefined, fallback?: string) => string;
  /** The same for dots, borders and icons (3:1). */
  mark: (color: string | null | undefined, fallback?: string) => string;
}

/**
 * Theme-aware versions of department/server colours (status, staffing, priority) for the current colour scheme: the hue
 * is kept, only the lightness moves, and only when the colour would not read.
 */
export const useReadableColor = (): ThemeReadableColors => {
  const scheme = useResolvedColorScheme();

  return useMemo(
    () => ({
      scheme,
      text: (color, fallback = lightTokens['typography-500']) => readableOnSurface(color || fallback, scheme, TEXT_CONTRAST),
      mark: (color, fallback = lightTokens['typography-500']) => readableOnSurface(color || fallback, scheme, MARK_CONTRAST),
    }),
    [scheme]
  );
};
