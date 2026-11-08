import { lineClampStyle, toAriaProps, toDomProps, withPixelLineHeight } from '../dom-props';

describe('toDomProps', () => {
  it('maps testID to data-testid and drops React Native only props', () => {
    const result = toDomProps({ testID: 'card', collapsable: false, onLayout: jest.fn(), hitSlop: 8, title: 'kept' } as Record<string, unknown>);

    expect(result).toEqual({ 'data-testid': 'card', title: 'kept' });
  });

  it('flattens a React Native style array into one style object', () => {
    const result = toDomProps({ style: [{ color: 'red' }, false, null, { fontWeight: 'bold', color: 'blue' }] } as Record<string, unknown>) as { style: unknown };

    expect(Array.isArray(result.style)).toBe(false);
    expect(result.style).toEqual({ color: 'blue', fontWeight: 'bold' });
  });

  it('leaves a plain style object as it is', () => {
    const style = { margin: 4 };
    const result = toDomProps({ style } as Record<string, unknown>) as { style: unknown };

    expect(result.style).toBe(style);
  });

  // React DOM writes a bare lineHeight number as a multiple of the font size: a 14px badge line would be 14 lines tall.
  it('turns a React Native lineHeight (pixels) into a CSS pixel length', () => {
    const result = toDomProps({ style: [{ fontSize: 11 }, { lineHeight: 14 }] });

    expect(result.style).toEqual({ fontSize: 11, lineHeight: '14px' });
  });

  it('turns numberOfLines into a CSS line clamp merged under the caller style', () => {
    const result = toDomProps({ numberOfLines: 2, style: [{ color: 'red' }] } as Record<string, unknown>) as { style: Record<string, unknown> };

    expect(result.style).toEqual({ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', color: 'red' });
    expect(result).not.toHaveProperty('numberOfLines');
  });

  it('carries pointerEvents none/auto over as CSS', () => {
    const result = toDomProps({ pointerEvents: 'none' } as Record<string, unknown>) as { style: Record<string, unknown> };

    expect(result.style).toEqual({ pointerEvents: 'none' });
    expect(result).not.toHaveProperty('pointerEvents');
  });

  // A shared Text with onPress (an "Open check-ins" link) did nothing on the web: the span got an unknown onPress prop.
  describe('onPress', () => {
    interface PressResult {
      role?: string;
      tabIndex?: number;
      onClick?: () => void;
      onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
      onPress?: unknown;
      style?: { cursor?: string; color?: string };
    }

    // SAFETY: toDomProps adds these props for an onPress (pressDomProps); DomProps<T> only types the caller's own props.
    const pressResult = <T extends object>(props: T) => toDomProps(props) as PressResult;
    const key = (name: string) => ({ key: name, preventDefault: jest.fn() });

    it('becomes a focusable, clickable button that Enter and Space press', () => {
      const onPress = jest.fn();
      const result = pressResult({ onPress, style: [{ color: 'red' }] });

      expect(result).toMatchObject({ role: 'button', tabIndex: 0, style: { cursor: 'pointer', color: 'red' } });
      expect(result).not.toHaveProperty('onPress');
      result.onClick?.();
      const enter = key('Enter');
      result.onKeyDown?.(enter);
      const space = key(' ');
      result.onKeyDown?.(space);
      result.onKeyDown?.(key('a'));

      expect(onPress).toHaveBeenCalledTimes(3);
      expect(space.preventDefault).toHaveBeenCalled();
    });

    it('keeps a link a link, pressed by Enter only', () => {
      const onPress = jest.fn();
      const result = pressResult({ onPress, accessibilityRole: 'link' });

      expect(result.role).toBe('link');
      result.onKeyDown?.(key(' '));
      expect(onPress).not.toHaveBeenCalled();
      result.onKeyDown?.(key('Enter'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does nothing while disabled', () => {
      const result = pressResult({ onPress: jest.fn(), accessibilityState: { disabled: true } });

      expect(result).not.toHaveProperty('onClick');
      expect(result).not.toHaveProperty('tabIndex');
    });

    it('lets a web-only onClick win and drops the press events the DOM has no name for', () => {
      const onClick = jest.fn();
      const result = pressResult({ onPress: jest.fn(), onClick, onLongPress: jest.fn(), onPressIn: jest.fn(), onPressOut: jest.fn() });

      expect(result.onClick).toBe(onClick);

      for (const name of ['onLongPress', 'onPressIn', 'onPressOut']) expect(result).not.toHaveProperty(name);
    });
  });

  describe('accessibility', () => {
    it('maps accessibility props onto aria attributes and role', () => {
      const result = toDomProps({
        accessibilityLabel: 'Close',
        accessibilityHint: 'Closes the sheet',
        accessibilityRole: 'button',
        accessibilityState: { disabled: true, selected: false, checked: 'mixed', busy: true, expanded: false },
        accessibilityLiveRegion: 'polite',
        nativeID: 'close-button',
      } as Record<string, unknown>);

      expect(result).toEqual({
        'aria-label': 'Close',
        'aria-description': 'Closes the sheet',
        role: 'button',
        'aria-disabled': true,
        'aria-selected': false,
        'aria-checked': 'mixed',
        'aria-busy': true,
        'aria-expanded': false,
        'aria-live': 'polite',
        id: 'close-button',
      });
    });

    it('translates React Native roles that differ from ARIA', () => {
      expect(toAriaProps({ accessibilityRole: 'header' })).toEqual({ role: 'heading', 'aria-level': 2 });
      expect(toAriaProps({ accessibilityRole: 'image' })).toEqual({ role: 'img' });
      expect(toAriaProps({ accessibilityRole: 'adjustable' })).toEqual({ role: 'slider' });
      expect(toAriaProps({ accessibilityRole: 'none' })).toEqual({});
      expect(toAriaProps({ accessibilityRole: 'text' })).toEqual({});
    });

    it('maps accessibilityValue and hidden subtrees', () => {
      expect(toAriaProps({ accessibilityValue: { min: 0, max: 10, now: 4, text: '4 of 10' } })).toEqual({ 'aria-valuemin': 0, 'aria-valuemax': 10, 'aria-valuenow': 4, 'aria-valuetext': '4 of 10' });
      expect(toAriaProps({ accessibilityElementsHidden: true })).toEqual({ 'aria-hidden': true });
      expect(toAriaProps({ importantForAccessibility: 'no-hide-descendants' })).toEqual({ 'aria-hidden': true });
    });

    it('lets explicit aria-* props win over the mapped ones', () => {
      const result = toDomProps({ accessibilityLabel: 'mapped', 'aria-label': 'explicit', role: 'link', accessibilityRole: 'button' } as Record<string, unknown>);

      expect(result).toEqual({ 'aria-label': 'explicit', role: 'link' });
    });
  });
});

describe('lineClampStyle', () => {
  it('is undefined without a positive line count', () => {
    expect(lineClampStyle(undefined)).toBeUndefined();
    expect(lineClampStyle(0)).toBeUndefined();
  });

  it('clamps to the given number of lines', () => {
    expect(lineClampStyle(3)).toMatchObject({ WebkitLineClamp: 3, overflow: 'hidden' });
  });
});

describe('withPixelLineHeight', () => {
  it('gives a numeric line height a px unit and keeps the rest of the style', () => {
    expect(withPixelLineHeight({ fontSize: 12, lineHeight: 16, color: 'red' })).toEqual({ fontSize: 12, lineHeight: '16px', color: 'red' });
  });

  it('returns a style without a numeric line height unchanged', () => {
    const relative = { lineHeight: '1.5' };
    const none = { fontSize: 12 };

    expect(withPixelLineHeight(relative)).toBe(relative);
    expect(withPixelLineHeight(none)).toBe(none);
  });
});
