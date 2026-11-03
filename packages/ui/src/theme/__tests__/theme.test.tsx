import { renderHook } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { useColorScheme } from 'react-native';

import { ColorSchemeProvider, resolveColorScheme, useResolvedColorScheme } from '../color-scheme';
import { darkTokens, lightTokens, TOKEN_NAMES } from '../tokens';
import { getThemeColors, useThemeColors } from '../use-theme-colors';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const mockOsScheme = useColorScheme as unknown as jest.Mock;

const withMode = (mode: 'light' | 'dark' | 'system') =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <ColorSchemeProvider mode={mode}>{children}</ColorSchemeProvider>;
  };

describe('useThemeColors', () => {
  afterEach(() => mockOsScheme.mockReturnValue('light'));

  it('returns light token colours in light mode', async () => {
    const { result } = await renderHook(() => useThemeColors(), { wrapper: withMode('light') });

    expect(result.current).toMatchObject({ scheme: 'light', isDark: false, background: lightTokens['background-0'], text: lightTokens['typography-900'], primary: lightTokens['primary-500'] });
  });

  it('returns dark token colours in dark mode', async () => {
    const { result } = await renderHook(() => useThemeColors(), { wrapper: withMode('dark') });

    expect(result.current).toMatchObject({ scheme: 'dark', isDark: true, background: darkTokens['background-0'], text: darkTokens['typography-900'], error: darkTokens['error-500'] });
  });

  it('follows the OS in system mode, and without a provider', async () => {
    mockOsScheme.mockReturnValue('dark');

    expect((await renderHook(() => useThemeColors(), { wrapper: withMode('system') })).result.current.isDark).toBe(true);
    expect((await renderHook(() => useThemeColors())).result.current.isDark).toBe(true);
  });

  it('lets an explicit mode override the OS (web cannot see the explicit choice otherwise)', async () => {
    mockOsScheme.mockReturnValue('dark');

    expect((await renderHook(() => useResolvedColorScheme(), { wrapper: withMode('light') })).result.current).toBe('light');
  });

  it('formats a token with alpha as rgba', () => {
    expect(getThemeColors('light').token('background-0', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(getThemeColors('dark').token('primary-600')).toBe(darkTokens['primary-600']);
  });

  it('memoizes one object per scheme', async () => {
    const { result, rerender } = await renderHook(() => useThemeColors(), { wrapper: withMode('light') });
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });

  it('resolves modes against the OS scheme', () => {
    expect(resolveColorScheme('system', 'dark')).toBe('dark');
    expect(resolveColorScheme('system', null)).toBe('light');
    expect(resolveColorScheme('dark', 'light')).toBe('dark');
  });
});

describe('theme tokens', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../../../../apps/omni/theme-tokens.css'), 'utf8');
  // The web-only .dark/.light class overrides (react-native-css rejects them on native).
  const webCss = fs.readFileSync(path.resolve(__dirname, '../../../../../apps/omni/theme-tokens.web.css'), 'utf8');

  const block = (source: string, start: number): string => {
    const open = source.indexOf('{', start);
    let depth = 1;
    let index = open + 1;

    while (depth > 0) {
      if (source[index] === '{') depth += 1;

      if (source[index] === '}') depth -= 1;
      index += 1;
    }

    return source.slice(open + 1, index - 1);
  };

  const parse = (source: string): Record<string, string> => {
    const out: Record<string, string> = {};

    for (const match of source.matchAll(/--color-([a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) {
      out[match[1]] = `#${[match[2], match[3], match[4]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
    }

    return out;
  };

  const light = parse(block(css, css.indexOf(':root {')));
  const dark = parse(block(css, css.indexOf(':root {', css.indexOf('@media (prefers-color-scheme: dark)'))));
  const webDark = parse(block(webCss, webCss.indexOf(':root.dark {')));
  const webLight = parse(block(webCss, webCss.indexOf(':root.light {')));

  it('mirrors theme-tokens.css exactly (regenerate tokens.ts when the CSS changes)', () => {
    expect(Object.keys(light).sort()).toEqual([...TOKEN_NAMES].sort());
    expect(lightTokens).toEqual(light);
    expect(darkTokens).toEqual(dark);
  });

  it('keeps the web .dark and .light classes in step with the dark media query and the light defaults', () => {
    expect(webDark).toEqual(dark);
    expect(webLight).toEqual(light);
  });

  it('keeps class-qualified :root selectors out of the native token file', () => {
    expect(css).not.toMatch(/:root\.(dark|light)\s*\{/);
  });

  // Dispatch/BigBoard shipped dark mode with primary 600–950 still dark, so text-primary-600, focus borders and
  // checked controls vanished on dark surfaces. In dark mode the primary ramp is the light ramp reversed.
  it('reverses the primary scale in dark mode', () => {
    const steps = ['0', '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
    steps.forEach((step, index) => {
      expect(darkTokens[`primary-${step}` as keyof typeof darkTokens]).toBe(lightTokens[`primary-${steps[steps.length - 1 - index]}` as keyof typeof lightTokens]);
    });
  });
});

// In dark mode a token fill (bg-primary-600, bg-error-500…) is the light end of its reversed ramp, so white on it is
// unreadable; text and icons on a token fill use text-typography-0 / colors.textInverse. White stays fine on fixed fills.
describe('token fill source rule', () => {
  const ROOTS = [path.resolve(__dirname, '../../../..'), path.resolve(__dirname, '../../../../../apps/omni')];
  const SKIP = new Set(['node_modules', '__tests__', 'dist', 'ios', 'android', 'e2e']);

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? (SKIP.has(entry.name) ? [] : walk(path.join(dir, entry.name))) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

  const TOKEN_FILL = /\bbg-(primary|secondary|tertiary|error|success|warning|info)-(500|600|700|800|900|950)\b/;
  const WHITE = /\btext-white\b|["'](#ffffff|#fff)["']/i;

  it('draws no white text or icons in a file that fills with a theme token', () => {
    const offenders = ROOTS.flatMap(walk).filter((file) => {
      const text = fs.readFileSync(file, 'utf8');

      return TOKEN_FILL.test(text) && WHITE.test(text);
    });

    expect(offenders.map((file) => path.relative(path.resolve(__dirname, '../../../../..'), file))).toEqual([]);
  });
});
