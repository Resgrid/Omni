import { render, screen } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { AppBarBackContext, type AppBarTitleSlot, AppBarTitleSlotContext, ScreenHeader } from '../common/screen-header';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }));

const makeSlot = (): jest.Mocked<AppBarTitleSlot> => ({ show: jest.fn(), hide: jest.fn() });

const inShell = (slot: AppBarTitleSlot, appBarShowsBack: boolean, element: React.ReactElement) => (
  <AppBarTitleSlotContext.Provider value={slot}>
    <AppBarBackContext.Provider value={appBarShowsBack}>{element}</AppBarBackContext.Provider>
  </AppBarTitleSlotContext.Provider>
);

describe('ScreenHeader', () => {
  beforeEach(() => {
    jest.mocked(useIsFocused).mockReturnValue(true);
  });

  it('is a row with its own back button outside the app shell', async () => {
    const onBack = jest.fn();
    await render(<ScreenHeader title="Call Details" onBack={onBack} right={<Text>menu</Text>} />);
    expect(screen.getByTestId('back-button')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Call Details' })).toBeTruthy();
    expect(screen.getByText('menu')).toBeTruthy();
  });

  it('titles the app bar instead of drawing a second header when the bar shows back', async () => {
    const slot = makeSlot();
    const menu = <Text>menu</Text>;
    const view = await render(inShell(slot, true, <ScreenHeader title="Call Details" onBack={jest.fn()} right={menu} />));
    expect(screen.queryByTestId('screen-header')).toBeNull();
    expect(screen.queryByText('Call Details')).toBeNull();
    expect(slot.show).toHaveBeenLastCalledWith(expect.any(String), { title: 'Call Details', right: menu });

    const owner = slot.show.mock.calls[0][0];
    await view.unmount();
    expect(slot.hide).toHaveBeenCalledWith(owner);
  });

  it('keeps its row and back button when the app bar has none (no history, as from a deep link)', async () => {
    const slot = makeSlot();
    await render(inShell(slot, false, <ScreenHeader title="New Call" onBack={jest.fn()} />));
    expect(screen.getByTestId('back-button')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'New Call' })).toBeTruthy();
    expect(slot.show).not.toHaveBeenCalled();
  });

  it('leaves the app bar to the visible screen: a screen kept mounted behind another gives it up', async () => {
    const slot = makeSlot();
    const view = await render(inShell(slot, true, <ScreenHeader title="Call Details" onBack={jest.fn()} />));
    const owner = slot.show.mock.calls[0][0];
    slot.show.mockClear();

    jest.mocked(useIsFocused).mockReturnValue(false);
    await view.rerender(inShell(slot, true, <ScreenHeader title="Call Details" onBack={jest.fn()} />));
    expect(slot.hide).toHaveBeenCalledWith(owner);
    expect(slot.show).not.toHaveBeenCalled();
  });
});
