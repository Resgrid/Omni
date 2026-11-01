import '../../calendar/__tests__/test-setup';

import { fetchPendingApproval, type PendingApprovalData, useAuthStore } from '@resgrid/auth';
import { ApproveSignInScreen as AuthUiApproveSignInScreen } from '@resgrid/features/auth-ui';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { activateTestVariant } from '../../settings/__tests__/variant';
import { PendingApprovalWatcher } from '../components/pending-approval-watcher';
import { PENDING_APPROVAL_CHECK_INTERVAL_MS, usePendingApprovalCheck } from '../hooks/use-pending-approval-check';
import { ApproveSignInScreen } from '../index';
import { approveSignInNav } from '../nav';
import { approveSignInRoutes } from '../routes';

jest.mock('@resgrid/auth', () => ({ ...jest.requireActual('@resgrid/auth'), fetchPendingApproval: jest.fn() }));

const mockFetch = fetchPendingApproval as jest.Mock;
const mockExpoRouter = jest.requireMock('expo-router') as Record<string, unknown>;
const mockPathname = jest.fn(() => '/home');
mockExpoRouter.usePathname = mockPathname;

const pending: PendingApprovalData = {
  ApprovalRequestId: 'req-1',
  RequestingApp: 'unit',
  InstallationLabel: null,
  Shared: false,
  Department: null,
  Purpose: 'login',
  Operation: null,
  OriginRegion: null,
  CreatedAt: null,
  ExpiresAt: null,
  AttemptsRemaining: 3,
};

let appStateListener: ((state: AppStateStatus) => void) | null = null;
const remove = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(null);
  mockPathname.mockReturnValue('/home');
  remove.mockClear();
  (router.push as jest.Mock).mockClear();
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('usePendingApprovalCheck', () => {
  it('opens the approve screen when a request is waiting', async () => {
    mockFetch.mockResolvedValueOnce(pending);
    renderHook(() => usePendingApprovalCheck(true));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/approve-sign-in'));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled, or when nothing is waiting', async () => {
    const { rerender } = renderHook(({ enabled }) => usePendingApprovalCheck(enabled), { initialProps: { enabled: false } });
    expect(mockFetch).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('stays put when the approve screen is already showing', async () => {
    mockPathname.mockReturnValue('/approve-sign-in');
    mockFetch.mockResolvedValueOnce(pending);
    renderHook(() => usePendingApprovalCheck(true));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await act(async () => undefined);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('checks again on foreground at most every 15 seconds', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    renderHook(() => usePendingApprovalCheck(true));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    await act(async () => appStateListener?.('active'));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    now += PENDING_APPROVAL_CHECK_INTERVAL_MS;
    await act(async () => appStateListener?.('background'));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => appStateListener?.('active'));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('opens nothing when the lookup finishes after it was disabled', async () => {
    let resolve: (value: PendingApprovalData) => void = () => undefined;
    mockFetch.mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    const { unmount } = renderHook(() => usePendingApprovalCheck(true));
    unmount();
    expect(remove).toHaveBeenCalled();
    await act(async () => resolve(pending));
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('PendingApprovalWatcher', () => {
  it('checks only for a signed-in member in a variant that approves sign-ins', async () => {
    activateTestVariant('responder');
    useAuthStore.setState({ status: 'signedOut' });
    const { rerender } = render(<PendingApprovalWatcher />);
    expect(mockFetch).not.toHaveBeenCalled();

    act(() => useAuthStore.setState({ status: 'signedIn' }));
    rerender(<PendingApprovalWatcher />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });

  it('is inert where approving sign-ins is not a capability', () => {
    activateTestVariant('responder', { push: { approveSignIns: false } });
    useAuthStore.setState({ status: 'signedIn' });
    render(<PendingApprovalWatcher />);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('approve-sign-in module surface', () => {
  it('re-exports the one approve screen and shares its route', () => {
    expect(ApproveSignInScreen).toBe(AuthUiApproveSignInScreen);
    expect(approveSignInRoutes.approveSignIn()).toBe('/approve-sign-in');
    expect(approveSignInRoutes.approveSignIn('req 1')).toBe('/approve-sign-in?id=req%201');
    const [entry] = approveSignInNav;
    expect(entry).toEqual(expect.objectContaining({ id: 'approve-sign-in', href: '/approve-sign-in', requiresModule: 'approve-sign-in' }));
    expect(entry?.requiresCapability?.(activateTestVariant('responder').capabilities)).toBe(true);
    expect(entry?.requiresCapability?.(activateTestVariant('unit').capabilities)).toBe(false);
  });
});
