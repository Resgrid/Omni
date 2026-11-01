import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type ToastItem, useToastStore } from '../store';
import { ModalToastHost, TOAST_LAYER_Z_INDEX, ToastContainer } from '../toast-container';
import { ToastMessage } from '../toast-message';

const setToasts = (toasts: ToastItem[]) => {
  act(() => useToastStore.setState({ toasts }));
};

describe('ToastContainer (Unit hosts)', () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts();
    useToastStore.setState({ modalHosts: [] });
    (useSafeAreaInsets as jest.Mock).mockReturnValue({ top: 44, bottom: 0, left: 0, right: 0 });
  });

  it('renders nothing when no toasts are present', () => {
    render(<ToastContainer />);

    expect(screen.queryByTestId('toast-host')).toBeNull();
  });

  it('renders every queued toast with its title and message', () => {
    setToasts([
      { id: '1', type: 'success', message: 'Success message' },
      { id: '2', type: 'error', message: 'Error message', title: 'Error Title' },
    ]);

    render(<ToastContainer />);

    expect(screen.getByText('Success message')).toBeTruthy();
    expect(screen.getByText('Error Title')).toBeTruthy();
    expect(screen.getByText('Error message')).toBeTruthy();
  });

  it('draws above gluestack overlays, which sit at zIndex 9999 on web, below the header', () => {
    setToasts([{ id: '1', type: 'error', message: 'Could not save' }]);

    render(<ToastContainer />);

    const layerStyle = StyleSheet.flatten(screen.getByTestId('toast-host').props.style);
    expect(TOAST_LAYER_Z_INDEX).toBeGreaterThan(9999);
    expect(layerStyle.zIndex).toBe(TOAST_LAYER_Z_INDEX);
    expect(layerStyle.top).toBe(44 + 70);
  });

  // A native Modal is its own window above the app, so the app-window host cannot be seen while one
  // is open; toasts have to render inside the topmost modal window instead.
  describe('inside native Modal windows', () => {
    const App = ({ openModals }: { openModals: number }) => (
      <>
        <ToastContainer />
        {openModals >= 1 ? <ModalToastHost key="sheet" /> : null}
        {openModals >= 2 ? <ModalToastHost key="picker" /> : null}
      </>
    );

    it('moves toasts into the modal while it is open and back to the app when it closes', () => {
      setToasts([{ id: '1', type: 'error', message: 'Error saving role assignments' }]);
      const { rerender } = render(<App openModals={0} />);
      expect(screen.getByTestId('toast-host')).toBeTruthy();

      rerender(<App openModals={1} />);

      expect(screen.queryByTestId('toast-host')).toBeNull();
      expect(screen.getAllByTestId('modal-toast-host')).toHaveLength(1);
      expect(screen.getAllByText('Error saving role assignments')).toHaveLength(1);

      rerender(<App openModals={0} />);

      expect(screen.getByTestId('toast-host')).toBeTruthy();
      expect(screen.queryByTestId('modal-toast-host')).toBeNull();
      expect(useToastStore.getState().modalHosts).toEqual([]);
    });

    it('renders in the most recently opened modal only', () => {
      setToasts([{ id: '1', type: 'info', message: 'Heads up' }]);
      const { rerender } = render(<App openModals={1} />);
      const sheetHostId = useToastStore.getState().modalHosts[0];

      rerender(<App openModals={2} />);

      expect(useToastStore.getState().modalHosts).toHaveLength(2);
      expect(screen.getAllByTestId('modal-toast-host')).toHaveLength(1);
      expect(screen.getAllByText('Heads up')).toHaveLength(1);

      // Closing the picker hands toasts back to the sheet underneath it.
      rerender(<App openModals={1} />);

      expect(useToastStore.getState().modalHosts).toEqual([sheetHostId]);
      expect(screen.getAllByTestId('modal-toast-host')).toHaveLength(1);
      expect(screen.queryByTestId('toast-host')).toBeNull();
    });
  });
});

describe('ToastMessage (IC UI)', () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts();
  });

  it('can be explicitly dismissed with an accessible button', () => {
    useToastStore.setState({ toasts: [{ id: 'dismissable', type: 'info', message: 'Pending changes' }] });
    render(<ToastMessage id="dismissable" type="info" message="Pending changes" />);

    const dismiss = screen.getByTestId('toast-dismiss-dismissable');
    expect(dismiss.props.accessibilityRole).toBe('button');
    expect(dismiss.props.accessibilityLabel).toBe('Dismiss');

    fireEvent.press(dismiss, { stopPropagation: jest.fn() });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('runs its action and dismisses when the toast is pressed', () => {
    const onPress = jest.fn();
    useToastStore.setState({ toasts: [{ id: 'actionable', type: 'info', message: 'View queue', onPress }] });
    render(<ToastMessage id="actionable" type="info" message="View queue" onPress={onPress} />);

    expect(screen.getByTestId('toast-message-actionable').props.accessibilityRole).toBe('button');
    fireEvent.press(screen.getByTestId('toast-message-actionable'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('is announced as an alert when it has no action', () => {
    render(<ToastMessage id="plain" type="warning" message="Offline" />);

    expect(screen.getByTestId('toast-message-plain').props.accessibilityRole).toBe('alert');
  });

  // Responder's fix: re-translating made i18next read "Error: x" as namespace "Error" and drop the prefix.
  it('renders text verbatim instead of passing it through t()', () => {
    render(<ToastMessage id="colon" type="error" title="common.error" message="Network error: request timed out" />);

    expect(screen.getByText('Network error: request timed out')).toBeTruthy();
    expect(screen.getByText('common.error')).toBeTruthy();
  });
});
