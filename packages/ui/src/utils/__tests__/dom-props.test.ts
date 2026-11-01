import { lineClampStyle, toAriaProps, toDomProps } from '../dom-props';

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
