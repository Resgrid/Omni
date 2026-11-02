/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
import '../../calls/__tests__/test-setup';

import { useMapMarkersStore } from '@resgrid/data';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { activateVariant, setRights } from '../../calls/__tests__/test-utils';
import { useMapTrafficPreferenceStore } from '../../map/hooks/use-traffic-preference';
import { ConsoleMap } from '../components/console-map';

jest.mock('@resgrid/maps', () => {
  const { Pressable, View } = require('react-native');
  const mockReact = require('react');
  return {
    MapView: ({ children, testID }: { children?: unknown; testID?: string }) => mockReact.createElement(View, { testID }, children),
    Camera: () => null,
    MapPins: () => null,
    TrafficLayer: ({ visible, idPrefix }: { visible?: boolean; idPrefix?: string }) => mockReact.createElement(View, { testID: `traffic-${idPrefix}`, accessibilityLabel: visible === false ? 'hidden' : 'visible' }),
    MapTrafficButton: ({ isOn, onPress, testID, side }: { isOn: boolean; onPress: () => void; testID?: string; side?: string }) =>
      mockReact.createElement(Pressable, { onPress, testID, accessibilityHint: side, accessibilityState: { selected: isOn } }),
    useMapStyle: () => ({ isAvailable: true, status: 'ready' }),
    useMapCenter: () => ({ latitude: 39, longitude: -105, zoomLevel: 9 }),
  };
});

beforeEach(() => {
  activateVariant('dispatch');
  setRights({ CanViewPII: true });
  useMapTrafficPreferenceStore.setState({ traffic: {} });
  useMapMarkersStore.setState({ markers: [], centerLatitude: 39, centerLongitude: -105, zoomLevel: 11 });
});

describe('ConsoleMap live traffic (§11.1)', () => {
  it('shows traffic by default on the console and remembers the dispatcher turning it off', async () => {
    await render(<ConsoleMap />);
    expect(screen.getByTestId('traffic-console-traffic').props.accessibilityLabel).toBe('visible');
    const button = screen.getByTestId('console-map-traffic-button');
    expect(button.props.accessibilityState).toEqual({ selected: true });
    expect(button.props.accessibilityHint).toBe('left');
    await fireEvent.press(button);
    expect(screen.getByTestId('traffic-console-traffic').props.accessibilityLabel).toBe('hidden');
    expect(useMapTrafficPreferenceStore.getState().traffic).toEqual({ 'dispatch-console': false });
  });

  it('follows the remembered choice', async () => {
    useMapTrafficPreferenceStore.setState({ traffic: { 'dispatch-console': false, map: true } });
    await render(<ConsoleMap />);
    expect(screen.getByTestId('traffic-console-traffic').props.accessibilityLabel).toBe('hidden');
  });
});
