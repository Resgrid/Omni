/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Platform } from 'react-native';

import { ThemedStatusBar } from '../focus-aware-status-bar';
import { ColorSchemeProvider } from '../theme/color-scheme';

jest.mock('expo-status-bar', () => {
  const { Text } = require('react-native');
  const mockReact = require('react');

  return { StatusBar: ({ style }: { style: string }) => mockReact.createElement(Text, { testID: 'status-bar' }, style) };
});

describe('ThemedStatusBar', () => {
  const os = Platform.OS;

  afterEach(() => {
    Platform.OS = os;
  });

  it('draws dark icons over the light theme and light icons over the dark one, whatever the device uses', async () => {
    const { rerender } = await render(
      <ColorSchemeProvider mode="light">
        <ThemedStatusBar />
      </ColorSchemeProvider>
    );

    expect(screen.getByTestId('status-bar')).toHaveTextContent('dark');

    await rerender(
      <ColorSchemeProvider mode="dark">
        <ThemedStatusBar />
      </ColorSchemeProvider>
    );

    expect(screen.getByTestId('status-bar')).toHaveTextContent('light');
  });

  it('draws nothing on the web, which has no status bar', async () => {
    Platform.OS = 'web';
    await render(
      <ColorSchemeProvider mode="light">
        <ThemedStatusBar />
      </ColorSchemeProvider>
    );

    expect(screen.queryByTestId('status-bar')).toBeNull();
  });
});
