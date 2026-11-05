import { act, render, renderHook, screen } from '@testing-library/react-native';
import React, { type ComponentRef } from 'react';
import { type HostInstance, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { KeyboardEvents, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_SHEET_TOP_GAP, CustomBottomSheet } from '../../bottom-sheet';
import { Modal, ModalBackdrop, ModalContent } from '../../modal';
import { focusedInputScrollDelta, useKeepFocusedInputVisible } from '../keep-focused-input-visible';
import { KEYBOARD_AWARE_BOTTOM_OFFSET, KeyboardAwareScrollView } from '../keyboard-aware-scroll-view';

// Modal subtrees are reachable only with hidden elements included (the host Modal is not "visible").
const q = { includeHiddenElements: true } as const;
const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID, q).props.style) ?? {};

let restoreKeyboard = (): void => undefined;

/** The keyboard as the library reports it: a negative height while it is up. Undone after each test. */
const keyboardUp = async (height: number) => {
  const closed = (await renderHook(() => useReanimatedKeyboardAnimation())).result.current;
  const { result } = await renderHook(() => ({ height: useSharedValue(-height), progress: useSharedValue(1) }));
  jest.mocked(useReanimatedKeyboardAnimation).mockReturnValue(result.current);
  restoreKeyboard = () => {
    jest.mocked(useReanimatedKeyboardAnimation).mockReturnValue(closed);
  };
};

afterEach(() => {
  restoreKeyboard();
  restoreKeyboard = () => undefined;
});

describe('focusedInputScrollDelta', () => {
  const viewport = { top: 100, height: 300 };

  it('leaves a field that already shows alone', () => {
    expect(focusedInputScrollDelta(viewport, { top: 200, height: 40 })).toBe(0);
  });

  it('scrolls a field below the visible area up into it, with the margin under it', () => {
    // The field ends at 520; the viewport at 400; 16 to spare.
    expect(focusedInputScrollDelta(viewport, { top: 480, height: 40 })).toBe(136);
  });

  it('scrolls back to a field above the visible area', () => {
    expect(focusedInputScrollDelta(viewport, { top: 60, height: 40 })).toBe(-56);
  });

  it('lines up the top of a field taller than the viewport', () => {
    expect(focusedInputScrollDelta(viewport, { top: 250, height: 400 })).toBe(134);
  });
});

describe('useKeepFocusedInputVisible', () => {
  const addListener = jest.mocked(KeyboardEvents.addListener);
  const scrollTo = jest.fn();

  const fakeScrollView = (top: number, height: number) =>
    // SAFETY: the hook only calls measureInWindow and scrollTo on its scroll view.
    ({ measureInWindow: (callback) => callback(0, top, 375, height), scrollTo: (options) => scrollTo(options) }) as ComponentRef<typeof ScrollView>;

  const focus = (top: number, height: number) =>
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(
      // SAFETY: the hook only measures the focused input.
      { measureInWindow: (callback) => callback(0, top, 343, height) } as HostInstance
    );

  const keyboardDidShow = async () => {
    const [, listener] = addListener.mock.calls[addListener.mock.calls.length - 1];
    await act(() => {
      listener({ height: 300, duration: 250, timestamp: 0, target: 1, type: 'default', appearance: 'light' });
      jest.advanceTimersByTime(20);
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    scrollTo.mockClear();
    addListener.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('scrolls the focused field into the visible part of the lifted scroll view once the keyboard is up', async () => {
    const { result } = await renderHook(() => useKeepFocusedInputVisible());
    result.current.scrollRef.current = fakeScrollView(200, 250);
    // SAFETY: onScroll reads only nativeEvent.contentOffset.
    result.current.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 40 } } } as NativeSyntheticEvent<NativeScrollEvent>);
    focus(470, 100);

    await keyboardDidShow();

    // Field bottom 570 + 16 against a viewport ending at 450: 136 further than the current 40.
    expect(scrollTo).toHaveBeenCalledWith({ y: 176, animated: true });
  });

  it('does not scroll when the field already shows', async () => {
    const { result } = await renderHook(() => useKeepFocusedInputVisible());
    result.current.scrollRef.current = fakeScrollView(200, 250);
    focus(250, 60);

    await keyboardDidShow();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('listens only while enabled, and stops listening on unmount', async () => {
    await renderHook(() => useKeepFocusedInputVisible(false));
    expect(addListener).not.toHaveBeenCalled();

    const { unmount } = await renderHook(() => useKeepFocusedInputVisible(true));
    expect(addListener).toHaveBeenCalledWith('keyboardDidShow', expect.any(Function));
    const subscription = addListener.mock.results[0].value;

    await unmount();
    expect(subscription.remove).toHaveBeenCalled();
  });
});

describe('CustomBottomSheet and the keyboard', () => {
  const renderSheet = () =>
    render(
      <CustomBottomSheet isOpen onClose={jest.fn()} testID="sheet">
        <TextInput testID="note" />
      </CustomBottomSheet>
    );

  afterEach(() => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('lays the sheet out above the keyboard instead of pinning it to the bottom of the window', async () => {
    await keyboardUp(320);
    await renderSheet();

    // An absolutely positioned `bottom: 0` sheet ignored the padding below; the note sat under the keyboard.
    expect(styleOf('sheet-content').position).toBeUndefined();
    expect(styleOf('sheet-content')).toMatchObject({ flexShrink: 1 });
    expect(styleOf('sheet-keyboard-frame')).toMatchObject({ justifyContent: 'flex-end', paddingBottom: 320 });
    expect(screen.getByTestId('sheet-keyboard-frame', q).props.pointerEvents).toBe('box-none');
  });

  it('keeps a sheet the keyboard pushed up clear of the status bar', async () => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 59, bottom: 34, left: 0, right: 0 });
    await renderSheet();

    expect(styleOf('sheet-keyboard-frame')).toMatchObject({ paddingTop: 59 });
  });

  it('keeps a minimum gap where the window has no status bar inset', async () => {
    await renderSheet();

    expect(styleOf('sheet-keyboard-frame')).toMatchObject({ paddingTop: BOTTOM_SHEET_TOP_GAP, paddingBottom: 0 });
  });

  it('tracks its scroll position so it can scroll the focused field into view', async () => {
    await renderSheet();

    const scroll = screen.getByTestId('sheet-sheet-scroll', q);
    expect(scroll.props.onScroll).toEqual(expect.any(Function));
    expect(scroll.props.scrollEventThrottle).toBe(16);
  });
});

describe('Modal and the keyboard', () => {
  it('centres the dialog in the space above the keyboard', async () => {
    await keyboardUp(300);
    await render(
      <Modal isOpen useRNModal onClose={jest.fn()} testID="dialog">
        <ModalBackdrop />
        <ModalContent>
          <Text>Password</Text>
        </ModalContent>
      </Modal>
    );

    expect(styleOf('dialog-keyboard-frame')).toMatchObject({ paddingBottom: 300, justifyContent: 'center', alignItems: 'center' });
    expect(screen.getByText('Password', q)).toBeTruthy();
  });
});

describe('KeyboardAwareScrollView', () => {
  it('keeps a margin under the focused field and lets taps through to buttons while the keyboard is up', async () => {
    await render(<KeyboardAwareScrollView testID="form" />);

    expect(screen.getByTestId('form').props).toMatchObject({ bottomOffset: KEYBOARD_AWARE_BOTTOM_OFFSET, keyboardShouldPersistTaps: 'handled' });
  });

  it('lets a screen override both', async () => {
    await render(<KeyboardAwareScrollView testID="form" bottomOffset={48} keyboardShouldPersistTaps="never" />);

    expect(screen.getByTestId('form').props).toMatchObject({ bottomOffset: 48, keyboardShouldPersistTaps: 'never' });
  });
});
