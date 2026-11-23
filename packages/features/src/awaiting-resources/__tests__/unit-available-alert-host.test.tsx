import '../../calls/__tests__/test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import { useAwaitingResourcesStore } from '@resgrid/data';
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { activateVariant, setRights } from '../../calls/__tests__/test-utils';
import { UnitAvailableAlertHost } from '../components/unit-available-alert-host';

const ALERT = {
  id: 'unit-7',
  unitId: 7,
  unitName: 'M-7',
  unitTypeName: 'MUG',
  message: null,
  receivedAt: 0,
  calls: [{ callId: 1, callNumber: '26-1', callName: null, priority: 1, label: 'MUG', responseSeconds: 60, ageMinutes: 3 }],
};

const hostStyle = () => StyleSheet.flatten(screen.getByTestId('unit-available-alert-host').props.style);

const initial = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };

const setWindow = async (width: number, height: number) => {
  const size = { width, height, scale: 3, fontScale: 1 };
  await act(() => Dimensions.set({ window: size, screen: size }));
};

beforeEach(() => {
  activateVariant('dispatch');
  setRights({});
  featureFlagsStore.setState({ flags: { 'Dispatch.RunCards': { enabled: true }, 'Dispatch.RunCardConditions': { enabled: true } }, isLoaded: true });
  useAwaitingResourcesStore.setState({ unitAlerts: [ALERT], busyKey: null });
});

afterEach(async () => {
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
  await act(() => Dimensions.set(initial));
});

// The alert is drawn over the whole shell (Dispatch on a phone): its Dispatch button sat on the home indicator, and in
// landscape its left edge under the notch.
describe('UnitAvailableAlertHost and the safe area', () => {
  it('keeps a phone card clear of the home indicator', async () => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 59, bottom: 34, left: 0, right: 0 });
    await setWindow(390, 844);
    await render(<UnitAvailableAlertHost />);

    expect(hostStyle()).toMatchObject({ bottom: 16 + 34, left: 12, right: 12 });
  });

  it('keeps a landscape phone card clear of the cutout at both sides', async () => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 0, bottom: 21, left: 59, right: 59 });
    await setWindow(844, 390);
    await render(<UnitAvailableAlertHost />);

    expect(hostStyle()).toMatchObject({ bottom: 16 + 21, left: 12 + 59, right: 12 + 59 });
  });

  it('keeps the tablet corner card inside the safe area', async () => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 24, bottom: 20, left: 0, right: 0 });
    await setWindow(1180, 820);
    await render(<UnitAvailableAlertHost />);

    expect(hostStyle()).toMatchObject({ bottom: 16 + 20, right: 16, width: 440 });
  });
});
