import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { CountBadge, formatBadgeCount } from '../count-badge';

describe('CountBadge', () => {
  it('shows the count, 99+ past 99, and nothing at zero or below', async () => {
    expect(formatBadgeCount(7)).toBe('7');
    expect(formatBadgeCount(99)).toBe('99');
    expect(formatBadgeCount(100)).toBe('99+');

    await render(<CountBadge count={0} testID="badge" />);
    expect(screen.queryByTestId('badge')).toBeNull();

    await render(<CountBadge count={null} testID="badge" />);
    expect(screen.queryByTestId('badge')).toBeNull();

    await render(<CountBadge count={250} testID="badge" />);
    expect(screen.getByTestId('badge')).toHaveTextContent('99+');
  });

  // The pill grows with large system text instead of clipping the digits.
  it('pins a line that fits inside a pill that can grow, in the corner or at the end of a row', async () => {
    await render(<CountBadge count={3} placement="corner" testID="badge" />);
    const corner = StyleSheet.flatten(screen.getByTestId('badge').props.style);

    expect(corner).toEqual(expect.objectContaining({ position: 'absolute', minHeight: 18 }));
    expect(corner.height).toBeUndefined();
    expect(StyleSheet.flatten(screen.getByText('3').props.style)).toEqual(expect.objectContaining({ fontSize: 11, lineHeight: 14 }));

    await render(<CountBadge count={3} testID="badge" />);
    expect(StyleSheet.flatten(screen.getByTestId('badge').props.style).position).toBeUndefined();
  });
});
