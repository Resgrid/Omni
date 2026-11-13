import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime } from '../../__tests__/helpers';
import { useAwaitingResourcesStore } from '../../awaiting-resources/awaiting-resources-store';
import { isServerBadgeCountKey, selectBadgeCount, useBadgeCountsStore } from '../badge-counts-store';

beforeEach(async () => {
  await createDataTestRuntime({ variant: 'dispatch' });
  await defaultResetRegistry.getStoreResets().get('data.badge-counts')?.('logout');
  await defaultResetRegistry.getStoreResets().get('data.awaiting-resources')?.('logout');
});

describe('Awaiting Resources badge (Dispatch side menu)', () => {
  it('counts the calls the awaiting-resources store holds, never asking the server for it', () => {
    // SAFETY: only the number of awaiting calls is read here; the call fields do not matter.
    useAwaitingResourcesStore.setState({ calls: [{ CallId: 1 }, { CallId: 2 }] as never });

    expect(useBadgeCountsStore.getState().awaitingResources).toBe(2);
    expect(selectBadgeCount('awaitingResources')(useBadgeCountsStore.getState())).toBe(2);
    expect(isServerBadgeCountKey('awaitingResources')).toBe(false);

    useAwaitingResourcesStore.setState({ calls: [] });

    expect(selectBadgeCount('awaitingResources')(useBadgeCountsStore.getState())).toBeNull();
  });
});
