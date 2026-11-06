import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { Text } from '../index';
import { inlineFontLineHeight } from '../line-height';

describe('inlineFontLineHeight', () => {
  it('scales the size class line height to an inline font size, as CSS does on the web', () => {
    // text-base: 1.5 × the font size, whatever it is (not the class's own 24px).
    expect(inlineFontLineHeight({ fontSize: 11 }, 'md', false, undefined)).toBe(16.5);
    expect(inlineFontLineHeight({ fontSize: 28 }, 'md', false, undefined)).toBe(42);
    expect(inlineFontLineHeight([{ fontSize: 12 }, { color: 'red' }], 'md', false, undefined)).toBe(18);
  });

  it('uses the ratio of the size class that wins: the size prop, then sub, then a className size', () => {
    expect(inlineFontLineHeight({ fontSize: 12 }, 'xs', false, undefined)).toBe(16);
    expect(inlineFontLineHeight({ fontSize: 14 }, 'sm', false, undefined)).toBe(20);
    expect(inlineFontLineHeight({ fontSize: 12 }, 'md', true, undefined)).toBe(16);
    expect(inlineFontLineHeight({ fontSize: 30 }, 'md', false, 'font-bold text-3xl text-typography-900')).toBe(36);
    expect(inlineFontLineHeight({ fontSize: 48 }, '5xl', false, undefined)).toBe(48);
  });

  it('ignores a size class behind a variant prefix', () => {
    expect(inlineFontLineHeight({ fontSize: 12 }, 'md', false, 'md:text-xs web:text-sm')).toBe(18);
  });

  it('leaves the class line height alone when there is nothing to scale or the caller set one', () => {
    expect(inlineFontLineHeight(undefined, 'md', false, undefined)).toBeUndefined();
    expect(inlineFontLineHeight({ color: 'red' }, 'md', false, undefined)).toBeUndefined();
    expect(inlineFontLineHeight({ fontSize: 11, lineHeight: 14 }, 'md', false, undefined)).toBeUndefined();
    expect(inlineFontLineHeight({ fontSize: 11 }, 'md', false, 'leading-5')).toBeUndefined();
    expect(inlineFontLineHeight({ fontSize: 10 }, '2xs', false, undefined)).toBeUndefined();
  });
});

describe('Text (native)', () => {
  it('gives text with an inline font size a line height that scales with it', async () => {
    await render(<Text style={{ fontSize: 11, color: 'white' }}>12</Text>);

    expect(StyleSheet.flatten(screen.getByText('12').props.style)).toEqual({ fontSize: 11, color: 'white', lineHeight: 16.5 });
  });

  it('passes an explicit line height and a style without a font size through unchanged', async () => {
    const pinned = { fontSize: 11, lineHeight: 14 };
    const plain = { color: 'red' };

    await render(
      <>
        <Text style={pinned}>pinned</Text>
        <Text style={plain}>plain</Text>
      </>
    );

    expect(screen.getByText('pinned').props.style).toBe(pinned);
    expect(screen.getByText('plain').props.style).toBe(plain);
  });
});
