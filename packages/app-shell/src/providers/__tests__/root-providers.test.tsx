import { navigateToNotificationTarget, usePushNotificationModalStore } from '@resgrid/notifications';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { activateVariant } from '../../__tests__/helpers/variants';
import { defineRoutes } from '../../routes/define-routes';
import { setRouteContract } from '../../routes/href';
import { resetShellStateForTests, setShellState } from '../../runtime/shell-state';
import { RootProviders } from '../root-providers';

const query = { includeHiddenElements: true } as const;

type ModalState = ReturnType<typeof usePushNotificationModalStore.getState>;

const openModal = async (notification: Partial<NonNullable<ModalState['notification']>>): Promise<void> => {
  await act(() => {
    usePushNotificationModalStore.setState({ isOpen: true, notification: { eventCode: 'C42', target: null, ...notification } as ModalState['notification'] });
  });
};

describe('RootProviders', () => {
  beforeEach(() => {
    activateVariant('responder');
    resetShellStateForTests();
    useToastStore.getState().clearToasts();
    usePushNotificationModalStore.setState({ isOpen: false, notification: null });
    setRouteContract(defineRoutes(['home']));
  });

  it('renders the app inside the provider tree with the toast host', async () => {
    await render(
      <RootProviders>
        <Text testID="child">app</Text>
      </RootProviders>
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    await act(() => {
      useToastStore.getState().showToast('info', 'Saved');
    });
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('follows the stored theme choice without remounting the app', async () => {
    const mounts = jest.fn();
    function Child() {
      React.useEffect(() => mounts(), []);
      return <Text testID="child">app</Text>;
    }
    await render(
      <RootProviders>
        <Child />
      </RootProviders>
    );
    await act(() => setShellState({ themeMode: 'dark' }));
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it('shows the push modal; "View" appears only when the variant has a screen for the target', async () => {
    await render(<RootProviders />);
    await openModal({ title: 'Structure fire', body: '12 Main St', target: { kind: 'call', id: '42' } });
    expect(screen.getByText('Structure fire', query)).toBeTruthy();
    expect(screen.getByText('12 Main St', query)).toBeTruthy();
    expect(screen.queryByTestId('push-notification-view', query)).toBeNull();

    await fireEvent.press(screen.getByTestId('push-notification-close', query));
    expect(usePushNotificationModalStore.getState().isOpen).toBe(false);
  });

  it('"View" deep-links through the route contract', async () => {
    setRouteContract(defineRoutes(['home', 'callDetail']));
    await render(<RootProviders />);
    await openModal({ target: { kind: 'call', id: '42' } });
    expect(screen.getByText('New notification', query)).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByTestId('push-notification-view', query));
    });

    expect(navigateToNotificationTarget).toHaveBeenCalledWith({ kind: 'call', id: '42' });
    expect(usePushNotificationModalStore.getState().isOpen).toBe(false);
  });
});
