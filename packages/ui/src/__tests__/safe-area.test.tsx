import { render, renderHook, screen } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fab, FAB_EDGE } from '../fab';
import { NativeModal } from '../native-modal';
import { BottomInsetConsumedContext, useBottomSafeAreaInset } from '../safe-area-view';

const IPHONE_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

const consumed = ({ children }: { children: ReactNode }) => <BottomInsetConsumedContext.Provider value>{children}</BottomInsetConsumedContext.Provider>;

const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID, { includeHiddenElements: true }).props.style) ?? {};

beforeEach(() => {
  jest.mocked(useSafeAreaInsets).mockReturnValue(IPHONE_INSETS);
});

afterEach(() => {
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
});

describe('useBottomSafeAreaInset', () => {
  it('is the device inset where the screen reaches the bottom of the display', async () => {
    const { result } = await renderHook(() => useBottomSafeAreaInset());

    expect(result.current).toBe(34);
  });

  it('is 0 above a bottom tab bar, which pads the inset itself', async () => {
    const { result } = await renderHook(() => useBottomSafeAreaInset(), { wrapper: consumed });

    expect(result.current).toBe(0);
  });

  // A modal is its own window over the tab bar: a control at its bottom keeps clear of the home indicator again.
  it('is the device inset again inside a native modal opened from a tab screen', async () => {
    function Probe() {
      return <Text testID="probe">{String(useBottomSafeAreaInset())}</Text>;
    }

    await render(
      <BottomInsetConsumedContext.Provider value>
        <NativeModal visible transparent>
          <Probe />
        </NativeModal>
      </BottomInsetConsumedContext.Provider>
    );

    expect(screen.getByTestId('probe', { includeHiddenElements: true })).toHaveTextContent('34');
  });
});

describe('Fab', () => {
  it('sits FAB_EDGE above the home indicator at the bottom of a screen', async () => {
    await render(<Fab testID="fab" />);

    expect(styleOf('fab')).toMatchObject({ bottom: FAB_EDGE + 34 });
  });

  it('sits FAB_EDGE above a bottom tab bar, which already clears the home indicator', async () => {
    await render(<Fab testID="fab" placement="bottom left" />, { wrapper: consumed });

    expect(styleOf('fab')).toMatchObject({ bottom: FAB_EDGE });
  });

  it('leaves a top placement alone', async () => {
    await render(<Fab testID="fab" placement="top right" />);

    expect(styleOf('fab').bottom).toBeUndefined();
  });

  it('lets a caller style move it', async () => {
    await render(<Fab testID="fab" style={{ bottom: 80 }} />);

    expect(styleOf('fab')).toMatchObject({ bottom: 80 });
  });
});
