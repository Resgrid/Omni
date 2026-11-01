// Badge handling: cleared on open and on every return to the foreground.
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { clearBadgeCount, useClearBadgeOnForeground } from '../badge';
import { mockSetAppActive } from './mocks/core';
import * as notifications from './mocks/expo-notifications';

const rn = jest.requireMock('react-native') as { Platform: { OS: string } };

function Harness({ enabled }: { enabled: boolean }): null {
  useClearBadgeOnForeground(enabled);
  return null;
}

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  rn.Platform.OS = 'ios';
  mockSetAppActive(true);
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

it('clears the badge on demand', async () => {
  await clearBadgeCount();
  expect(notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
});

it('clears the badge on open and whenever the app comes back to the foreground', async () => {
  await act(async () => {
    renderer = create(createElement(Harness, { enabled: true }));
  });
  expect(notifications.setBadgeCountAsync).toHaveBeenCalledTimes(1);
  await act(async () => mockSetAppActive(false));
  await act(async () => mockSetAppActive(true));
  expect(notifications.setBadgeCountAsync).toHaveBeenCalledTimes(2);
});

it('does nothing while disabled', async () => {
  await act(async () => {
    renderer = create(createElement(Harness, { enabled: false }));
  });
  expect(notifications.setBadgeCountAsync).not.toHaveBeenCalled();
});
