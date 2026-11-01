/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import './test-setup';

import type { OutboxItemView, OutboxSnapshot, StorageReport } from '@resgrid/offline';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import React from 'react';

import { fakeAuthStore, resetFakeAuth } from '../../auth-ui/__tests__/auth-fake';
import { configureSettings, resetSettingsRuntimeForTests, type StorageSyncServices } from '../runtime';
import { StorageSyncScreen } from '../screens/storage-sync-screen';
import { activateTestVariant } from './variant';

jest.mock('@resgrid/auth', () => require('../../auth-ui/__tests__/auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));
jest.mock('@resgrid/voice', () => require('./native-mocks').voiceModule());
jest.mock('@resgrid/notifications', () => require('./native-mocks').notificationsModule());

const item = (overrides: Partial<OutboxItemView>): OutboxItemView => ({
  id: 'a',
  type: 'status.set',
  state: 'pending',
  createdAt: 0,
  ageMs: 5 * 60_000,
  attempts: 0,
  requiresOnlineAuth: false,
  awaitingConfirmation: false,
  stuck: false,
  ...overrides,
});

const ITEMS: OutboxItemView[] = [
  item({ id: 'evt-1', type: 'status.set', state: 'pending', ageMs: 5 * 60_000, attempts: 1 }),
  item({ id: 'evt-2', type: 'call.note.add', state: 'dead', ageMs: 3 * 3_600_000, attempts: 8, lastError: { status: 422, code: 'validation_failed', message: 'Note too long' } }),
  item({ id: 'evt-3', type: 'ic.lane.create', state: 'pending', stuck: true, ageMs: 26 * 3_600_000, attempts: 3 }),
];

const report = (overrides: Partial<StorageReport> = {}): StorageReport => ({
  generatedAt: 1,
  engine: 'sqlite',
  sizes: {
    databaseBytes: 5 * 1024 * 1024,
    databaseFreeBytes: 0,
    cachedDataBytes: 1536,
    outboxBytes: 2048,
    attachmentsBytes: null,
    mapPacksBytes: 120 * 1024 * 1024,
    keyValueBytes: 512,
    freeDeviceBytes: 8 * 1024 * 1024 * 1024,
    byArea: { outbox: 2048, cache: 1536, 'working-set': 0, attachments: 0, 'map-packs': 0, system: 0 },
    byTable: [],
  },
  budget: { budgetBytes: 150 * 1024 * 1024, usedBytes: 5 * 1024 * 1024, overBudget: false },
  pending: { unsent: 3, pending: 2, processing: 0, failed: 0, dead: 1, stuck: 1, awaitingConfirmation: 0, held: 2, oldestUnsentAt: 0 },
  items: ITEMS,
  lastSyncAt: Date.UTC(2026, 9, 31, 12, 0, 0),
  lastHydrationAt: null,
  lastMaintenanceAt: null,
  lastMaintenance: null,
  ...overrides,
});

const snapshotOf = (items: OutboxItemView[]): OutboxSnapshot => ({
  counts: {
    unsent: items.filter((entry) => entry.state !== 'dead').length,
    pending: items.filter((entry) => entry.state === 'pending').length,
    processing: 0,
    failed: 0,
    dead: items.filter((entry) => entry.state === 'dead').length,
    stuck: items.filter((entry) => entry.stuck).length,
    awaitingConfirmation: 0,
    held: 2,
    total: items.length,
  },
  items,
  isDraining: false,
  lastDrainAt: null,
  lastDrainStatus: null,
  recentlyDropped: [],
  updatedAt: 1,
});

const buildServices = () => {
  let snapshot = snapshotOf(ITEMS);
  const listeners = new Set<(value: OutboxSnapshot) => void>();
  const services = {
    storage: {
      getStorageReport: jest.fn(async () => report()),
      getDiagnosticsSummary: jest.fn(async () => {
        const { items: _items, ...rest } = report();
        return { ...rest, itemTypes: { 'status.set': 1, 'call.note.add': 1, 'ic.lane.create': 1 } };
      }),
      clearCachedData: jest.fn(async () => ({ tablesCleared: ['calls'], rowsRemoved: 10, areasCleared: ['map-packs'], apiCacheCleared: true })),
      clearAllLocalData: jest.fn(async (options?: { confirmed?: boolean }) =>
        options?.confirmed ? { status: 'cleared' as const, discardedUnsent: 2, tablesCleared: [], areasCleared: [], signOutFailed: false } : { status: 'confirmation-required' as const, unsentCount: 2 }
      ),
    },
    outbox: {
      retry: jest.fn(async () => true),
      retryAll: jest.fn(async () => 2),
      discard: jest.fn(async () => true),
      confirmOnlineAuth: jest.fn(async () => true),
      drain: jest.fn(async () => ({ status: 'completed' as const, sent: [], failed: [], dead: [], superseded: [], droppedForeign: [], held: 0, waiting: 0 })),
      getSnapshot: () => snapshot,
      subscribe: (listener: (value: OutboxSnapshot) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    sync: { onReconnect: jest.fn(async () => ({ ok: true, completed: ['drainOutbox' as const], failed: [] })) },
  };
  const publish = (items: OutboxItemView[]) => {
    snapshot = snapshotOf(items);
    listeners.forEach((listener) => listener(snapshot));
  };
  return { services, publish };
};

const renderScreen = async () => {
  const built = buildServices();
  configureSettings({ storageSync: built.services as unknown as StorageSyncServices });
  render(<StorageSyncScreen />);
  await screen.findByTestId('storage-size-database');
  return built;
};

describe('StorageSyncScreen', () => {
  beforeEach(() => {
    resetFakeAuth();
    resetSettingsRuntimeForTests();
    activateTestVariant('ic');
  });

  it('says when offline storage is not bound yet', () => {
    render(<StorageSyncScreen />);
    expect(screen.getByTestId('storage-unavailable')).toBeTruthy();
  });

  it('shows sizes by area, free space and the budget', async () => {
    await renderScreen();
    expect(screen.getByTestId('storage-size-database')).toHaveTextContent(/5\.0 MB/);
    expect(screen.getByTestId('storage-size-cached')).toHaveTextContent(/1\.5 KB/);
    expect(screen.getByTestId('storage-size-queued')).toHaveTextContent(/2\.0 KB/);
    expect(screen.getByTestId('storage-size-attachments')).toHaveTextContent(/storage_sync\.unknown_size/);
    expect(screen.getByTestId('storage-size-map-packs')).toHaveTextContent(/120 MB/);
    expect(screen.getByTestId('storage-size-free')).toHaveTextContent(/8\.0 GB/);
    expect(screen.getByTestId('storage-budget')).toHaveTextContent('storage_sync.budget [used=5.0 MB,budget=150 MB]');
  });

  it('lists queued, failed and stuck changes with type, age, attempts and last error', async () => {
    await renderScreen();
    expect(screen.getByTestId('storage-pending-summary')).toHaveTextContent('storage_sync.pending_summary [unsent=2,failed=1,stuck=1]');
    expect(screen.getByTestId('storage-item-evt-1-meta')).toHaveTextContent('storage_sync.age.minutes [count=5] · storage_sync.attempts [count=1]');
    expect(screen.getByTestId('storage-item-evt-2-state')).toHaveTextContent('storage_sync.state.dead');
    expect(screen.getByTestId('storage-item-evt-2-error')).toHaveTextContent('storage_sync.last_error [error=validation_failed]');
    expect(screen.getByTestId('storage-item-evt-3-state')).toHaveTextContent('storage_sync.state.stuck');
    expect(screen.getByTestId('storage-item-evt-3-meta')).toHaveTextContent(/storage_sync\.age\.hours \[count=26\]/);
    expect(screen.getByTestId('storage-pending-held')).toHaveTextContent('storage_sync.held [count=2]');
    // A waiting change cannot be retried by hand; a failed or stuck one can.
    expect(screen.queryByTestId('storage-item-evt-1-retry')).toBeNull();
    expect(screen.getByTestId('storage-item-evt-2-retry')).toBeTruthy();
  });

  it('retries one change and all failed changes', async () => {
    const { services } = await renderScreen();
    fireEvent.press(screen.getByTestId('storage-item-evt-2-retry'));
    await waitFor(() => expect(services.outbox.retry).toHaveBeenCalledWith('evt-2'));
    fireEvent.press(screen.getByTestId('storage-retry-all'));
    await waitFor(() => expect(services.outbox.retryAll).toHaveBeenCalled());
  });

  it('discards a change only after confirmation', async () => {
    const { services } = await renderScreen();
    fireEvent.press(screen.getByTestId('storage-item-evt-1-discard'));
    expect(within(screen.getByTestId('storage-confirm')).getByText('storage_sync.discard_message')).toBeTruthy();
    fireEvent.press(screen.getByTestId('storage-confirm-cancel'));
    expect(services.outbox.discard).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('storage-item-evt-1-discard'));
    fireEvent.press(screen.getByTestId('storage-confirm-confirm'));
    await waitFor(() => expect(services.outbox.discard).toHaveBeenCalledWith('evt-1', { confirmed: true }));
  });

  it('follows the outbox as it drains', async () => {
    const { publish } = await renderScreen();
    act(() => publish([ITEMS[1]]));
    expect(screen.queryByTestId('storage-item-evt-1')).toBeNull();
    expect(screen.getByTestId('storage-item-evt-2')).toBeTruthy();
    act(() => publish([]));
    expect(screen.getByTestId('storage-pending-empty')).toBeTruthy();
  });

  it('shows the last sync and runs "Sync now"', async () => {
    const { services } = await renderScreen();
    expect(screen.getByTestId('storage-last-hydration')).toHaveTextContent(/storage_sync\.never/);
    fireEvent.press(screen.getByTestId('storage-sync-now'));
    expect(await screen.findByTestId('storage-sync-outcome')).toHaveTextContent('storage_sync.sync_synced');
    expect(services.sync.onReconnect).toHaveBeenCalled();
    // The reconnect sequence drained the outbox already.
    expect(services.outbox.drain).not.toHaveBeenCalled();
  });

  it('clears cached data after confirmation, keeping the session', async () => {
    const { services } = await renderScreen();
    fireEvent.press(screen.getByTestId('storage-clear-cached'));
    fireEvent.press(screen.getByTestId('storage-confirm-confirm'));
    await waitFor(() => expect(services.storage.clearCachedData).toHaveBeenCalled());
    expect(fakeAuthStore.getState().logout).not.toHaveBeenCalled();
  });

  it('warns with the unsent count before clearing all local data, then wipes and signs out', async () => {
    fakeAuthStore.setState({ status: 'signedIn', accessToken: 'token' });
    const { services } = await renderScreen();
    fireEvent.press(screen.getByTestId('storage-clear-all'));

    expect(await screen.findByText('storage_sync.clear_all_message_unsent [count=2]')).toBeTruthy();
    expect(services.storage.clearAllLocalData).toHaveBeenCalledWith();
    expect(services.storage.clearAllLocalData).not.toHaveBeenCalledWith({ confirmed: true });

    fireEvent.press(screen.getByTestId('storage-confirm-confirm'));
    await waitFor(() => expect(services.storage.clearAllLocalData).toHaveBeenCalledWith({ confirmed: true }));
    await waitFor(() => expect(fakeAuthStore.getState().logout).toHaveBeenCalledWith('Local data cleared', 'logout'));
  });

  it('does nothing when clearing all local data is cancelled', async () => {
    const { services } = await renderScreen();
    fireEvent.press(screen.getByTestId('storage-clear-all'));
    await screen.findByTestId('storage-confirm-cancel');
    fireEvent.press(screen.getByTestId('storage-confirm-cancel'));
    expect(services.storage.clearAllLocalData).toHaveBeenCalledTimes(1);
    expect(fakeAuthStore.getState().logout).not.toHaveBeenCalled();
  });

  it('shows a copyable diagnostics summary with counts and sizes only', async () => {
    await renderScreen();
    fireEvent.press(screen.getByTestId('storage-diagnostics-show'));
    const text = await screen.findByTestId('storage-diagnostics-text');
    expect(text).toHaveTextContent(/"itemTypes"/);
    expect(text).not.toHaveTextContent(/evt-1/);
    fireEvent.press(screen.getByTestId('storage-diagnostics-copy'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('"databaseBytes": 5242880')));
  });
});
