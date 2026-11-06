import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageViewer } from '../image-viewer';
import { clampOffset, clampZoom, MAX_ZOOM, MIN_ZOOM, touchDistance } from '../image-viewer/zoom';

// Modal subtrees are reachable only with hidden elements included (the host Modal is not "visible").
const query = { includeHiddenElements: true } as const;

describe('ImageViewer', () => {
  it('stays closed without a picture', async () => {
    await render(<ImageViewer source={null} label="Call image" onClose={jest.fn()} testID="viewer" />);

    expect(screen.queryByTestId('viewer-image', query)).toBeNull();
  });

  it('shows the picture fitted to the screen, with its caption, and closes from the close button', async () => {
    const onClose = jest.fn();

    await render(<ImageViewer source={{ uri: 'https://files.test/scene.jpg' }} caption="Scene" label="Scene" onClose={onClose} testID="viewer" />);

    const image = screen.getByTestId('viewer-image', query);

    expect(image.props.source).toEqual({ uri: 'https://files.test/scene.jpg' });
    expect(image.props.contentFit).toBe('contain');
    expect(image.props.accessibilityLabel).toBe('Scene');
    expect(screen.getByText('Scene', query)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('viewer-close', query));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves the caption out when there is none, and closes on the hardware back button', async () => {
    const onClose = jest.fn();

    await render(<ImageViewer source={{ uri: 'https://files.test/scene.jpg' }} label="Call image" onClose={onClose} testID="viewer" />);

    expect(screen.queryByTestId('viewer-caption', query)).toBeNull();

    screen.getByTestId('viewer', query).props.onRequestClose();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('takes the touches on the picture for pinch, drag and double tap', async () => {
    await render(<ImageViewer source={{ uri: 'https://files.test/scene.jpg' }} label="Call image" onClose={jest.fn()} testID="viewer" />);

    const frame = screen.getByTestId('viewer-frame', query);

    expect(frame.props.onStartShouldSetResponder?.()).toBe(true);
    expect(frame.props.onResponderMove).toEqual(expect.any(Function));
  });

  it('keeps the close button and caption clear of the notch with its own window’s insets, not the page sheet’s it opened over', async () => {
    // The page sheet the viewer opens from has no top inset; the viewer's full-screen window (NativeModal's own
    // SafeAreaProvider) has the status bar and the home indicator.
    const mockInModal = React.createContext(false);
    const safeArea = jest.requireMock<{ SafeAreaProvider: React.FC<{ children?: React.ReactNode }> }>('react-native-safe-area-context');
    const provider = jest.spyOn(safeArea, 'SafeAreaProvider').mockImplementation(({ children }) => <mockInModal.Provider value>{children}</mockInModal.Provider>);
    jest.mocked(useSafeAreaInsets).mockImplementation(() => (React.useContext(mockInModal) ? { top: 47, bottom: 34, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 }));

    try {
      await render(<ImageViewer source={{ uri: 'https://files.test/scene.jpg' }} caption="Scene" label="Scene" onClose={jest.fn()} testID="viewer" />);

      expect(StyleSheet.flatten(screen.getByTestId('viewer-caption', query).props.style)).toMatchObject({ paddingBottom: 50 });
      expect(StyleSheet.flatten(screen.getByTestId('viewer-close', query).parent?.props.style)).toMatchObject({ top: 55 });
    } finally {
      provider.mockRestore();
      jest.mocked(useSafeAreaInsets).mockImplementation(() => ({ top: 0, bottom: 0, left: 0, right: 0 }));
    }
  });
});

describe('ImageViewer zoom math', () => {
  it('keeps the zoom between fitted and the maximum', () => {
    expect(clampZoom(0.4)).toBe(MIN_ZOOM);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(12)).toBe(MAX_ZOOM);
  });

  it('measures the pinch between the first two fingers only', () => {
    expect(touchDistance([])).toBe(0);
    expect(touchDistance([{ pageX: 10, pageY: 10 }])).toBe(0);
    expect(
      touchDistance([
        { pageX: 0, pageY: 0 },
        { pageX: 30, pageY: 40 },
        { pageX: 500, pageY: 500 },
      ])
    ).toBe(50);
  });

  it('keeps a zoomed picture inside its frame, and a fitted one centred', () => {
    expect(clampOffset(80, 400, 1)).toBe(0);
    // At 2x a 400-point frame shows 800 points: it can move 200 either way.
    expect(clampOffset(150, 400, 2)).toBe(150);
    expect(clampOffset(350, 400, 2)).toBe(200);
    expect(clampOffset(-350, 400, 2)).toBe(-200);
  });
});
