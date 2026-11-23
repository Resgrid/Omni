import { fireEvent, render, screen } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { type AppBarExit, AppBarExitContext, type AppBarTitleSlot, AppBarTitleSlotContext, ScreenHeader } from '../common/screen-header';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }));

const makeSlot = (): jest.Mocked<AppBarTitleSlot> => ({ show: jest.fn(), hide: jest.fn() });

const inShell = (slot: AppBarTitleSlot, exit: AppBarExit, element: React.ReactElement) => (
  <AppBarTitleSlotContext.Provider value={slot}>
    <AppBarExitContext.Provider value={exit}>{element}</AppBarExitContext.Provider>
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
    await fireEvent.press(screen.getByTestId('back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('titles the app bar instead of drawing a second header when the bar shows back', async () => {
    const slot = makeSlot();
    const menu = <Text>menu</Text>;
    const view = await render(inShell(slot, 'back', <ScreenHeader title="Call Details" onBack={jest.fn()} right={menu} />));
    expect(screen.queryByTestId('screen-header')).toBeNull();
    expect(screen.queryByText('Call Details')).toBeNull();
    expect(slot.show).toHaveBeenLastCalledWith(expect.any(String), { title: 'Call Details', right: menu });

    const owner = slot.show.mock.calls[0][0];
    await view.unmount();
    expect(slot.hide).toHaveBeenCalledWith(owner);
  });

  // Dispatch's New Call is a menu entry: the bar shows the menu button and the entry's label, and a row of its own under it
  // repeated the title with a back arrow beside the hamburger.
  it('titles the app bar of a top-level screen too, with no back arrow: the menu leads elsewhere', async () => {
    const slot = makeSlot();
    const save = <Text>save</Text>;
    await render(inShell(slot, 'menu', <ScreenHeader title="New Call" onBack={jest.fn()} right={save} />));
    expect(screen.queryByTestId('screen-header')).toBeNull();
    expect(screen.queryByTestId('back-button')).toBeNull();
    expect(screen.queryByText('New Call')).toBeNull();
    expect(slot.show).toHaveBeenLastCalledWith(expect.any(String), { title: 'New Call', right: save });
  });

  it('keeps its row and back button when the app bar has no way out (below the top level, no history: a deep link)', async () => {
    const slot = makeSlot();
    const onBack = jest.fn();
    await render(inShell(slot, 'none', <ScreenHeader title="Call Details" onBack={onBack} />));
    expect(screen.getByRole('header', { name: 'Call Details' })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(slot.show).not.toHaveBeenCalled();
  });

  it.each<AppBarExit>(['back', 'menu'])('draws no back arrow without an app bar slot when the bar covers leaving (%s)', async (exit) => {
    await render(
      <AppBarExitContext.Provider value={exit}>
        <ScreenHeader title="New Call" onBack={jest.fn()} />
      </AppBarExitContext.Provider>
    );
    expect(screen.getByRole('header', { name: 'New Call' })).toBeTruthy();
    expect(screen.queryByTestId('back-button')).toBeNull();
  });

  it('leaves the app bar to the visible screen: a screen kept mounted behind another gives it up', async () => {
    const slot = makeSlot();
    const view = await render(inShell(slot, 'back', <ScreenHeader title="Call Details" onBack={jest.fn()} />));
    const owner = slot.show.mock.calls[0][0];
    slot.show.mockClear();

    jest.mocked(useIsFocused).mockReturnValue(false);
    await view.rerender(inShell(slot, 'back', <ScreenHeader title="Call Details" onBack={jest.fn()} />));
    expect(slot.hide).toHaveBeenCalledWith(owner);
    expect(slot.show).not.toHaveBeenCalled();
  });
});
