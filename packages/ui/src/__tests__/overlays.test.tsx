import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Animated, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_SHEET_BACKDROP_ARM_DELAY_MS, CustomBottomSheet } from '../bottom-sheet';
import { ALL_ORIENTATIONS, NativeModal } from '../native-modal';
import { SIDE_DRAWER_BACKDROP_ARM_DELAY_MS, SideDrawer } from '../side-drawer';
import { useToastStore } from '../toast/store';

// Modal subtrees are reachable only with hidden elements included in RNTL 12 (the host Modal is not "visible").
const query = { includeHiddenElements: true } as const;

describe('NativeModal (Unit)', () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts();
    useToastStore.setState({ modalHosts: [] });
  });

  it('renders its content and shows toasts inside the modal window', () => {
    render(
      <NativeModal visible transparent onRequestClose={jest.fn()} testID="native-modal">
        <Text>Sheet content</Text>
      </NativeModal>
    );

    act(() => useToastStore.setState({ toasts: [{ id: '1', type: 'error', message: 'Check-in failed' }] }));

    expect(screen.getByText('Sheet content', query)).toBeTruthy();
    expect(screen.getByTestId('modal-toast-host', query)).toBeTruthy();
    expect(screen.getByText('Check-in failed', query)).toBeTruthy();
    expect(useToastStore.getState().modalHosts).toHaveLength(1);
  });

  it('releases its toast host when it is hidden', () => {
    const { rerender } = render(
      <NativeModal visible onRequestClose={jest.fn()}>
        <Text>Sheet content</Text>
      </NativeModal>
    );
    expect(useToastStore.getState().modalHosts).toHaveLength(1);

    rerender(
      <NativeModal visible={false} onRequestClose={jest.fn()}>
        <Text>Sheet content</Text>
      </NativeModal>
    );

    expect(useToastStore.getState().modalHosts).toEqual([]);
  });

  it('allows every orientation unless the caller narrows it (iOS defaults Modal to portrait)', () => {
    const { rerender } = render(
      <NativeModal visible testID="native-modal">
        <Text>x</Text>
      </NativeModal>
    );
    expect(screen.getByTestId('native-modal', query).props.supportedOrientations).toEqual(ALL_ORIENTATIONS);

    rerender(
      <NativeModal visible testID="native-modal" supportedOrientations={['portrait']}>
        <Text>x</Text>
      </NativeModal>
    );
    expect(screen.getByTestId('native-modal', query).props.supportedOrientations).toEqual(['portrait']);
  });
});

describe('CustomBottomSheet (Unit + IC)', () => {
  const renderSheet = (props: Partial<React.ComponentProps<typeof CustomBottomSheet>> = {}) =>
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

  it('renders nothing until opened', () => {
    renderSheet({ isOpen: false });

    expect(screen.queryByTestId('bottom-sheet', query)).toBeNull();
  });

  it('renders backdrop, content and children in a NativeModal (with toast host and all orientations)', () => {
    renderSheet();

    expect(screen.getByTestId('bottom-sheet-backdrop', query)).toBeTruthy();
    expect(screen.getByTestId('bottom-sheet-content', query)).toBeTruthy();
    expect(screen.getByText('Sheet body', query)).toBeTruthy();
    expect(screen.getByTestId('bottom-sheet', query).props.supportedOrientations).toEqual(ALL_ORIENTATIONS);
    expect(useToastStore.getState().modalHosts).toHaveLength(1);
  });

  it('ignores backdrop taps until the open animation has settled, then closes', () => {
    const onClose = jest.fn();
    renderSheet({ onClose });

    fireEvent.press(screen.getByTestId('bottom-sheet-backdrop', query));
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(BOTTOM_SHEET_BACKDROP_ARM_DELAY_MS);
    });
    fireEvent.press(screen.getByTestId('bottom-sheet-backdrop', query));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and loading text instead of children while loading', () => {
    renderSheet({ isLoading: true, loadingText: 'Loading roles' });

    expect(screen.getByText('Loading roles', query)).toBeTruthy();
    expect(screen.queryByText('Sheet body', query)).toBeNull();
  });

  it('uses the theme background token for the sheet surface', () => {
    renderSheet();

    expect(screen.getByTestId('bottom-sheet-content', query).props.style).toMatchObject({ backgroundColor: '#ffffff' });
  });

  describe('close animation interruption (IC fix)', () => {
    // The close used to unmount the Modal only when the animation reported finished === true. A cancelled
    // native-driver animation reports false, and the transparent full-screen Modal stayed mounted, swallowing
    // every touch on the screen underneath.
    it('unmounts the modal even when the close animation does not finish', () => {
      const parallelSpy = jest.spyOn(Animated, 'parallel');
      const { rerender } = renderSheet();
      expect(screen.getByTestId('bottom-sheet', query)).toBeTruthy();

      parallelSpy.mockReturnValue({ start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: false }) } as unknown as Animated.CompositeAnimation);

      act(() => {
        rerender(
          <CustomBottomSheet isOpen={false} onClose={jest.fn()} testID="bottom-sheet">
            <Text>Sheet body</Text>
          </CustomBottomSheet>
        );
      });

      expect(screen.queryByTestId('bottom-sheet', query)).toBeNull();
      parallelSpy.mockRestore();
    });

    it('keeps the sheet mounted when a close is superseded by a re-open', () => {
      const { rerender } = renderSheet();
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
      act(() => rerender(sheet(false)));
      act(() => rerender(sheet(true)));
      act(() => closeCallback?.({ finished: false }));

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

  it('renders nothing until opened', () => {
    render(drawer(false));

    expect(screen.queryByTestId('drawer-panel', query)).toBeNull();
  });

  it('shows the panel inside the safe area with its content when open', () => {
    render(drawer(true));

    const panel = screen.getByTestId('drawer-panel', query);
    expect(panel.props.style).toMatchObject({ paddingTop: 47, paddingBottom: 34 });
    expect(screen.getByText('Menu', query)).toBeTruthy();
  });

  it('dismisses on a backdrop tap only after the opening tap window', () => {
    const onClose = jest.fn();
    render(drawer(true, onClose));

    fireEvent.press(screen.getByTestId('drawer-backdrop', query));
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(SIDE_DRAWER_BACKDROP_ARM_DELAY_MS);
    });
    fireEvent.press(screen.getByTestId('drawer-backdrop', query));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('labels the backdrop as a close control for screen readers', () => {
    render(drawer(true));

    const backdrop = screen.getByTestId('drawer-backdrop', query);
    expect(backdrop.props.accessibilityRole).toBe('button');
    expect(backdrop.props.accessibilityLabel).toBe('Close menu');
  });

  it('unmounts after an interrupted close animation', () => {
    const { rerender } = render(drawer(true));
    const parallelSpy = jest.spyOn(Animated, 'parallel').mockReturnValue({
      start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: false }),
    } as unknown as Animated.CompositeAnimation);

    act(() => rerender(drawer(false)));

    expect(screen.queryByTestId('drawer-panel', query)).toBeNull();
    parallelSpy.mockRestore();
  });
});
