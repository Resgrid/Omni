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

  it('returns light token colours in light mode', () => {
    const { result } = renderHook(() => useThemeColors(), { wrapper: withMode('light') });

    expect(result.current).toMatchObject({ scheme: 'light', isDark: false, background: lightTokens['background-0'], text: lightTokens['typography-900'], primary: lightTokens['primary-500'] });
  });

  it('returns dark token colours in dark mode', () => {
    const { result } = renderHook(() => useThemeColors(), { wrapper: withMode('dark') });

    expect(result.current).toMatchObject({ scheme: 'dark', isDark: true, background: darkTokens['background-0'], text: darkTokens['typography-900'], error: darkTokens['error-500'] });
  });

  it('follows the OS in system mode, and without a provider', () => {
    mockOsScheme.mockReturnValue('dark');

    expect(renderHook(() => useThemeColors(), { wrapper: withMode('system') }).result.current.isDark).toBe(true);
    expect(renderHook(() => useThemeColors()).result.current.isDark).toBe(true);
  });

  it('lets an explicit mode override the OS (web cannot see the explicit choice otherwise)', () => {
    mockOsScheme.mockReturnValue('dark');

    expect(renderHook(() => useResolvedColorScheme(), { wrapper: withMode('light') }).result.current).toBe('light');
  });

  it('formats a token with alpha as rgba', () => {
    expect(getThemeColors('light').token('background-0', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(getThemeColors('dark').token('primary-600')).toBe(darkTokens['primary-600']);
  });

  it('memoizes one object per scheme', () => {
    const { result, rerender } = renderHook(() => useThemeColors(), { wrapper: withMode('light') });
    const first = result.current;
    rerender({});
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

  const block = (start: number): string => {
    const open = css.indexOf('{', start);
    let depth = 1;
    let index = open + 1;
    while (depth > 0) {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}') depth -= 1;
      index += 1;
    }
    return css.slice(open + 1, index - 1);
  };

  const parse = (source: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const match of source.matchAll(/--color-([a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) {
      out[match[1]] = `#${[match[2], match[3], match[4]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
    }
    return out;
  };

  const light = parse(block(css.indexOf(':root {')));
  const dark = parse(block(css.indexOf(':root {', css.indexOf('@media (prefers-color-scheme: dark)'))));
  const webDark = parse(block(css.indexOf(':root.dark {')));

  it('mirrors theme-tokens.css exactly (regenerate tokens.ts when the CSS changes)', () => {
    expect(Object.keys(light).sort()).toEqual([...TOKEN_NAMES].sort());
    expect(lightTokens).toEqual(light);
    expect(darkTokens).toEqual(dark);
  });

  it('keeps the web .dark class in step with the dark media query', () => {
    expect(webDark).toEqual(dark);
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
