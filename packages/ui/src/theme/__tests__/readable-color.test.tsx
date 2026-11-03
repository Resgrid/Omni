import { renderHook } from '@testing-library/react-native';
import React from 'react';

import { ColorSchemeProvider } from '../color-scheme';
import { contentOnFill, contrastRatio, MARK_CONTRAST, parseColor, readableOnSurface, TEXT_CONTRAST, THEME_SURFACES, tintOf, useReadableColor } from '../readable-color';

describe('readable-color', () => {
  it('reads 3, 4, 6 and 8 digit hex and rgb(), and nothing else', () => {
    expect(parseColor('#000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColor('#2f9e44cc')).toEqual({ r: 47, g: 158, b: 68 });
    expect(parseColor('#fffa')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('rgba(10,20,30,0.5)')).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor('label-default')).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });

  it('lightens black in dark mode and darkens white and pale yellow in light mode until they read', () => {
    expect(contrastRatio(readableOnSurface('#000', 'dark'), THEME_SURFACES.dark)).toBeGreaterThanOrEqual(TEXT_CONTRAST);

    for (const pale of ['#ffffff', '#ffff99', '#DBDB2E']) {
      expect(contrastRatio(readableOnSurface(pale, 'light'), THEME_SURFACES.light)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    }
  });

  it('keeps the hue, returns a colour that already reads unchanged, and leaves unparseable input alone', () => {
    const red = parseColor(readableOnSurface('#7f0000', 'dark'));
    expect(red?.r).toBeGreaterThan(red?.g ?? 255);
    expect(readableOnSurface('#e03131', 'light', MARK_CONTRAST)).toBe('#e03131');
    expect(readableOnSurface('label-default', 'dark')).toBe('label-default');
    expect(readableOnSurface(undefined, 'dark')).toBe('');
  });

  it('picks dark content on light fills and white on dark or unparseable fills', () => {
    expect(contentOnFill('#ffff99')).toBe('#111827');
    expect(contentOnFill('#000')).toBe('#ffffff');
    expect(contentOnFill('label-default')).toBe('#ffffff');
  });

  it('builds a valid 8-digit wash from short hex, transparent when unparseable', () => {
    expect(tintOf('#000')).toBe('#00000018');
    expect(tintOf('#2f9e44', '20')).toBe('#2f9e4420');
    expect(tintOf('label-default')).toBe('transparent');
  });

  it('adjusts for the scheme the provider resolved', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <ColorSchemeProvider mode="dark">{children}</ColorSchemeProvider>;
    const { result } = await renderHook(() => useReadableColor(), { wrapper });

    expect(result.current.scheme).toBe('dark');
    expect(contrastRatio(result.current.text('#000000'), THEME_SURFACES.dark)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(contrastRatio(result.current.mark(null), THEME_SURFACES.dark)).toBeGreaterThanOrEqual(MARK_CONTRAST);
  });
});
