import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { activateVariant } from '../../__tests__/helpers/variants';
import { mockNavigationState, resetMockNavigation } from '../../__tests__/mocks/expo-router';
import { ShellProvider, useHeaderActions, useHeaderActionsNode } from '../shell-context';

const TOGGLES = <Text testID="console-toggles">toggles</Text>;

function AppBarActions() {
  const actions = useHeaderActionsNode();

  return actions ? <>{actions}</> : <Text testID="no-actions">none</Text>;
}

function ConsoleScreen() {
  useHeaderActions(TOGGLES);

  return null;
}

beforeEach(() => resetMockNavigation());

describe('useHeaderActions', () => {
  it('shows a screen’s actions in the app bar only while that screen is focused', async () => {
    const variant = activateVariant('dispatch');

    // A new element each time, so the screen renders again and reads its focus.
    const tree = () => (
      <ShellProvider variant={variant}>
        <AppBarActions />
        <ConsoleScreen />
      </ShellProvider>
    );

    const { rerender } = await render(tree());
    expect(screen.getByTestId('console-toggles')).toBeTruthy();

    // A screen opened from the menu goes over the home, which the drawer shells' stack keeps mounted underneath.
    mockNavigationState.isFocused = false;
    await rerender(tree());
    expect(screen.queryByTestId('console-toggles')).toBeNull();
    expect(screen.getByTestId('no-actions')).toBeTruthy();

    // Back on the home: its actions return.
    mockNavigationState.isFocused = true;
    await act(async () => rerender(tree()));
    expect(screen.getByTestId('console-toggles')).toBeTruthy();
  });
});
