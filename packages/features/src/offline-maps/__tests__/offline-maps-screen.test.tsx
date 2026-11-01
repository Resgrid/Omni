/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import '../../settings/__tests__/test-setup';

import { isOfflineMapPacksSupported } from '@resgrid/maps/offline';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import { buildContentRows, formatBytes, statusKey } from '../lib/present';
import { configureOfflineMaps, resetOfflineMapsRuntimeForTests } from '../runtime';
import { OfflineMapsScreen } from '../screens/offline-maps-screen';
import { createFakeController, offlineState } from './fake-controller';

jest.mock('@resgrid/auth', () => require('../../auth-ui/__tests__/auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));
jest.mock('@resgrid/maps/offline', () => ({ ...jest.requireActual('@resgrid/maps/offline'), isOfflineMapPacksSupported: jest.fn(() => true) }));

const supported = isOfflineMapPacksSupported as jest.Mock;

beforeEach(() => {
  supported.mockReturnValue(true);
  resetOfflineMapsRuntimeForTests();
});

describe('OfflineMapsScreen', () => {
  it('waits for the shell to configure offline maps', () => {
    render(<OfflineMapsScreen />);
    expect(screen.getByTestId('offline-maps-loading')).toBeTruthy();
  });

  it('explains when the department does not offer offline maps', () => {
    const { controller } = createFakeController(offlineState({ availability: 'disabled' }));
    configureOfflineMaps({ controller });
    render(<OfflineMapsScreen />);
    expect(screen.getByTestId('offline-maps-unavailable')).toHaveTextContent('offline_maps.unavailable');
    expect(screen.queryByTestId('offline-maps-download')).toBeNull();
  });

  it('is not offered on web and Electron', () => {
    supported.mockReturnValue(false);
    const { controller } = createFakeController();
    configureOfflineMaps({ controller });
    render(<OfflineMapsScreen />);
    expect(screen.getByTestId('offline-maps-unsupported')).toHaveTextContent('offline_maps.unsupported');
    expect(controller.refreshIfStale).not.toHaveBeenCalled();
  });

  it('checks the manifest on open and downloads on request', async () => {
    const { controller } = createFakeController();
    configureOfflineMaps({ controller });
    render(<OfflineMapsScreen />);
    expect(controller.refreshIfStale).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('offline-maps-status')).toHaveTextContent('offline_maps.status.not_downloaded');
    expect(screen.getByTestId('offline-maps-size-pending')).toHaveTextContent(/120 MB/);
    expect(screen.getByTestId('offline-maps-attribution')).toHaveTextContent(/Protomaps © OpenStreetMap/);

    fireEvent.press(screen.getByTestId('offline-maps-download'));
    await waitFor(() => expect(controller.download).toHaveBeenCalledTimes(1));
  });

  it('shows progress while downloading and stops on request', () => {
    const { controller } = createFakeController(
      offlineState({ status: 'downloading', progress: { completedBytes: 30 * 1024 * 1024, totalBytes: 120 * 1024 * 1024, fraction: 0.25, currentName: 'Cell 1', itemIndex: 1, itemCount: 4 } })
    );
    configureOfflineMaps({ controller });
    render(<OfflineMapsScreen />);
    expect(screen.getByTestId('offline-maps-status')).toHaveTextContent('offline_maps.status.downloading');
    expect(screen.getByTestId('offline-maps-progress-text')).toHaveTextContent(/25%/);
    expect(screen.queryByTestId('offline-maps-download')).toBeNull();
    expect(screen.queryByTestId('offline-maps-delete')).toBeNull();
    fireEvent.press(screen.getByTestId('offline-maps-stop'));
    expect(controller.cancel).toHaveBeenCalledTimes(1);
  });

  it('follows state changes from the manager', () => {
    const fake = createFakeController();
    configureOfflineMaps({ controller: fake.controller });
    render(<OfflineMapsScreen />);
    act(() => fake.setState({ status: 'waiting-for-wifi', error: 'waiting-for-wifi' }));
    expect(screen.getByTestId('offline-maps-status')).toHaveTextContent('offline_maps.status.waiting_for_wifi');
    expect(screen.getByTestId('offline-maps-error')).toHaveTextContent('offline_maps.error.waiting_for_wifi');
  });

  it('lists the contents, offers an update and deletes after confirmation', async () => {
    const installed = offlineState({
      isInstalled: true,
      installedBytes: 119 * 1024 * 1024,
      stale: true,
      packs: offlineState().packs.map((pack) => (pack.packId === 'pack:c2' ? { ...pack, state: 'outdated' as const } : pack.state === 'rejected' ? pack : { ...pack, state: 'installed' as const })),
    });
    const { controller } = createFakeController(installed);
    configureOfflineMaps({ controller });
    render(<OfflineMapsScreen />);

    expect(screen.getByTestId('offline-maps-status')).toHaveTextContent('offline_maps.status.update_available');
    expect(screen.getByTestId('offline-maps-download')).toHaveTextContent('offline_maps.update');
    expect(screen.getByTestId('offline-maps-stale')).toBeTruthy();
    expect(screen.getByTestId('offline-maps-item-basemap-state')).toHaveTextContent('offline_maps.state.outdated');
    expect(within(screen.getByTestId('offline-maps-item-basemap')).getByText('offline_maps.item.basemap_count [count=2]')).toBeTruthy();
    expect(screen.getByTestId('offline-maps-item-pack:big-state')).toHaveTextContent('offline_maps.error.pack_too_large');

    fireEvent.press(screen.getByTestId('offline-maps-delete'));
    fireEvent.press(screen.getByTestId('offline-maps-delete-dialog-confirm'));
    await waitFor(() => expect(controller.deleteAll).toHaveBeenCalledTimes(1));
  });

  it('toggles Wi-Fi only', () => {
    const { controller } = createFakeController();
    configureOfflineMaps({ controller });
    render(<OfflineMapsScreen />);
    expect(screen.getByTestId('offline-maps-wifi-only-note')).toBeTruthy();
    fireEvent(screen.getByTestId('offline-maps-wifi-only'), 'valueChange', false);
    expect(controller.setWifiOnly).toHaveBeenCalledWith(false);
  });

  it('checks for updates on request', async () => {
    const { controller } = createFakeController(offlineState({ isInstalled: true, updateAvailable: false }));
    configureOfflineMaps({ controller });
    render(<OfflineMapsScreen />);
    expect(screen.getByTestId('offline-maps-status')).toHaveTextContent('offline_maps.status.up_to_date');
    expect(screen.queryByTestId('offline-maps-download')).toBeNull();
    fireEvent.press(screen.getByTestId('offline-maps-refresh'));
    await waitFor(() => expect(controller.refreshManifest).toHaveBeenCalledWith({ force: true }));
  });
});

describe('presentation helpers', () => {
  it('formats sizes and statuses', () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(300 * 1024 * 1024)).toBe('300 MB');
    expect(statusKey(offlineState({ isInstalled: true, updateAvailable: false }))).toBe('offline_maps.status.up_to_date');
    expect(statusKey(offlineState({ status: 'paused' }))).toBe('offline_maps.status.paused');
  });

  it('groups base cells and department files into single rows', () => {
    const rows = buildContentRows(offlineState().packs);
    expect(rows.map((row) => row.id)).toEqual(['basemap', 'department-data', 'pack:m1', 'pack:big']);
    expect(rows[0]).toMatchObject({ detailCount: 2, sizeBytes: 119 * 1024 * 1024, state: 'not-downloaded' });
  });
});
