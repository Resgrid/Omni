import { act, fireEvent, render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_SHEET_BACKDROP_ARM_DELAY_MS, CustomBottomSheet, getBottomSheetHeight } from '../bottom-sheet';
import { ALL_ORIENTATIONS, NativeModal, NativeModalScreen } from '../native-modal';
import { SIDE_DRAWER_BACKDROP_ARM_DELAY_MS, SideDrawer } from '../side-drawer';
import { useToastStore } from '../toast/store';

// Modal subtrees are reachable only with hidden elements included in RNTL 12 (the host Modal is not "visible").
const query = { includeHiddenElements: true } as const;

describe('NativeModal (Unit)', () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts();
    useToastStore.setState({ modalHosts: [] });
  });

  it('renders its content and shows toasts inside the modal window', async () => {
    await render(
      <NativeModal visible transparent onRequestClose={jest.fn()} testID="native-modal">
        <Text>Sheet content</Text>
      </NativeModal>
    );

    await act(() => useToastStore.setState({ toasts: [{ id: '1', type: 'error', message: 'Check-in failed' }] }));

    expect(screen.getByText('Sheet content', query)).toBeTruthy();
    expect(screen.getByTestId('modal-toast-host', query)).toBeTruthy();
    expect(screen.getByText('Check-in failed', query)).toBeTruthy();
    expect(useToastStore.getState().modalHosts).toHaveLength(1);
  });

  it('releases its toast host when it is hidden', async () => {
    const { rerender } = await render(
      <NativeModal visible onRequestClose={jest.fn()}>
        <Text>Sheet content</Text>
      </NativeModal>
    );

    expect(useToastStore.getState().modalHosts).toHaveLength(1);

    await rerender(
      <NativeModal visible={false} onRequestClose={jest.fn()}>
        <Text>Sheet content</Text>
      </NativeModal>
    );

    expect(useToastStore.getState().modalHosts).toEqual([]);
  });

  it('allows every orientation unless the caller narrows it (iOS defaults Modal to portrait)', async () => {
    const { rerender } = await render(
      <NativeModal visible testID="native-modal">
        <Text>x</Text>
      </NativeModal>
    );

    expect(screen.getByTestId('native-modal', query).props.supportedOrientations).toEqual(ALL_ORIENTATIONS);

    await rerender(
      <NativeModal visible testID="native-modal" supportedOrientations={['portrait']}>
        <Text>x</Text>
      </NativeModal>
    );
    expect(screen.getByTestId('native-modal', query).props.supportedOrientations).toEqual(['portrait']);
  });

  it('pads a page sheet clear of the status bar, cutout and home indicator, keeping the sheet’s own style', async () => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 32, bottom: 24, left: 8, right: 4 });
    await render(
      <NativeModal visible presentationStyle="pageSheet">
        <NativeModalScreen style={{ backgroundColor: '#000000' }} testID="sheet-screen">
          <Text>Call Notes</Text>
        </NativeModalScreen>
      </NativeModal>
    );

    expect(StyleSheet.flatten(screen.getByTestId('sheet-screen', query).props.style)).toEqual({ flex: 1, paddingTop: 32, paddingBottom: 24, paddingLeft: 8, paddingRight: 4, backgroundColor: '#000000' });
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});

// A page-sheet or full-screen modal fills its window, and on Android that window runs under the status bar. Without a
// NativeModalScreen root its header and close button sit beneath the status bar, cut off and out of reach of a tap.
describe('opaque NativeModal source rule', () => {
  const ROOTS = [path.resolve(__dirname, '../../..'), path.resolve(__dirname, '../../../../apps/omni')];
  const SKIP = new Set(['node_modules', '__tests__', 'dist', 'ios', 'android', '.metro-cache', '.expo']);

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? (SKIP.has(entry.name) ? [] : walk(path.join(dir, entry.name))) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

  it('gives every page-sheet and full-screen NativeModal a NativeModalScreen root', () => {
    const offenders = ROOTS.flatMap(walk).filter((file) => {
      const text = fs.readFileSync(file, 'utf8');

      return /<NativeModal\b/.test(text) && /presentationStyle=["'](pageSheet|formSheet|fullScreen)["']/.test(text) && !text.includes('<NativeModalScreen');
    });

    expect(offenders.map((file) => path.relative(path.resolve(__dirname, '../../../..'), file))).toEqual([]);
  });
});

describe('CustomBottomSheet (Unit + IC)', () => {
  const renderSheet = async (props: Partial<React.ComponentProps<typeof CustomBottomSheet>> = {}) =>
    render(
      <CustomBottomSheet isOpen onClose={jest.fn()} testID="bottom-sheet" {...props}>
        <Text>Sheet body</Text>
      </CustomBottomSheet>
    );

  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.setState({ modalHosts: [] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing until opened', async () => {
    await renderSheet({ isOpen: false });

    expect(screen.queryByTestId('bottom-sheet', query)).toBeNull();
  });

  it('renders backdrop, content and children in a NativeModal (with toast host and all orientations)', async () => {
    await renderSheet();

    expect(screen.getByTestId('bottom-sheet-backdrop', query)).toBeTruthy();
    expect(screen.getByTestId('bottom-sheet-content', query)).toBeTruthy();
    expect(screen.getByText('Sheet body', query)).toBeTruthy();
    expect(screen.getByTestId('bottom-sheet', query).props.supportedOrientations).toEqual(ALL_ORIENTATIONS);
    expect(useToastStore.getState().modalHosts).toHaveLength(1);
  });

  it('ignores backdrop taps until the open animation has settled, then closes', async () => {
    const onClose = jest.fn();
    await renderSheet({ onClose });

    await fireEvent.press(screen.getByTestId('bottom-sheet-backdrop', query));
    expect(onClose).not.toHaveBeenCalled();

    await act(() => {
      jest.advanceTimersByTime(BOTTOM_SHEET_BACKDROP_ARM_DELAY_MS);
    });
    await fireEvent.press(screen.getByTestId('bottom-sheet-backdrop', query));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and loading text instead of children while loading', async () => {
    await renderSheet({ isLoading: true, loadingText: 'Loading roles' });

    expect(screen.getByText('Loading roles', query)).toBeTruthy();
    expect(screen.queryByText('Sheet body', query)).toBeNull();
  });

  it('uses the theme background token for the sheet surface', async () => {
    await renderSheet();

    expect(screen.getByTestId('bottom-sheet-content', query).props.style).toMatchObject({ backgroundColor: '#ffffff' });
  });

  it('caps the sheet at its snap height, clamped to 300 px and the window less 20', () => {
    expect(getBottomSheetHeight(1000, 80)).toBe(800);
    expect(getBottomSheetHeight(1000)).toBe(670);
    expect(getBottomSheetHeight(320, 50)).toBe(300);
    expect(getBottomSheetHeight(1000, 100)).toBe(980);
  });

  describe('close animation interruption (IC fix)', () => {
    // The close used to unmount the Modal only when the animation reported finished === true. A cancelled
    // native-driver animation reports false, and the transparent full-screen Modal stayed mounted, swallowing
    // every touch on the screen underneath.
    it('unmounts the modal even when the close animation does not finish', async () => {
      const parallelSpy = jest.spyOn(Animated, 'parallel');
      const { rerender } = await renderSheet();
      expect(screen.getByTestId('bottom-sheet', query)).toBeTruthy();

      parallelSpy.mockReturnValue({ start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: false }) } as unknown as Animated.CompositeAnimation);

      await act(async () => {
        await rerender(
          <CustomBottomSheet isOpen={false} onClose={jest.fn()} testID="bottom-sheet">
            <Text>Sheet body</Text>
          </CustomBottomSheet>
        );
      });

      expect(screen.queryByTestId('bottom-sheet', query)).toBeNull();
      parallelSpy.mockRestore();
    });

    it('keeps the sheet mounted when a close is superseded by a re-open', async () => {
      const { rerender } = await renderSheet();
      const parallelSpy = jest.spyOn(Animated, 'parallel');
      let closeCallback: ((result: { finished: boolean }) => void) | undefined;
      parallelSpy.mockReturnValueOnce({
        start: (callback?: (result: { finished: boolean }) => void) => {
          closeCallback = callback;
        },
      } as unknown as Animated.CompositeAnimation);

      const sheet = (isOpen: boolean) => (
        <CustomBottomSheet isOpen={isOpen} onClose={jest.fn()} testID="bottom-sheet">
          <Text>Sheet body</Text>
        </CustomBottomSheet>
      );

      await act(async () => rerender(sheet(false)));
      await act(async () => rerender(sheet(true)));
      await act(() => closeCallback?.({ finished: false }));

      expect(screen.getByTestId('bottom-sheet', query)).toBeTruthy();
      parallelSpy.mockRestore();
    });
  });
});

describe('SideDrawer (IC)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (useSafeAreaInsets as jest.Mock).mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const drawer = (isOpen: boolean, onClose = jest.fn()) => (
    <SideDrawer isOpen={isOpen} onClose={onClose} testID="drawer">
      <Text>Menu</Text>
    </SideDrawer>
  );

  it('renders nothing until opened', async () => {
    await render(drawer(false));

    expect(screen.queryByTestId('drawer-panel', query)).toBeNull();
  });

  it('shows the panel inside the safe area with its content when open', async () => {
    await render(drawer(true));

    const panel = screen.getByTestId('drawer-panel', query);
    expect(panel.props.style).toMatchObject({ paddingTop: 47, paddingBottom: 34 });
    expect(screen.getByText('Menu', query)).toBeTruthy();
  });

  it('dismisses on a backdrop tap only after the opening tap window', async () => {
    const onClose = jest.fn();
    await render(drawer(true, onClose));

    await fireEvent.press(screen.getByTestId('drawer-backdrop', query));
    expect(onClose).not.toHaveBeenCalled();

    await act(() => {
      jest.advanceTimersByTime(SIDE_DRAWER_BACKDROP_ARM_DELAY_MS);
    });
    await fireEvent.press(screen.getByTestId('drawer-backdrop', query));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('labels the backdrop as a close control for screen readers', async () => {
    await render(drawer(true));

    const backdrop = screen.getByTestId('drawer-backdrop', query);
    expect(backdrop.props.accessibilityRole).toBe('button');
    expect(backdrop.props.accessibilityLabel).toBe('Close menu');
  });

  it('unmounts after an interrupted close animation', async () => {
    const { rerender } = await render(drawer(true));

    const parallelSpy = jest.spyOn(Animated, 'parallel').mockReturnValue({
      start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: false }),
    } as unknown as Animated.CompositeAnimation);

    await act(async () => rerender(drawer(false)));

    expect(screen.queryByTestId('drawer-panel', query)).toBeNull();
    parallelSpy.mockRestore();
  });
});
