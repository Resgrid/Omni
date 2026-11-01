/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import '../../settings/__tests__/test-setup';

import { approvePendingRequest, denyPendingRequest, fetchPendingApproval, type PendingApprovalData } from '@resgrid/auth';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { activateTestVariant } from '../../settings/__tests__/variant';
import { ApproveSignInScreen } from '../screens/approve-sign-in-screen';
import { resetFakeAuth } from './auth-fake';

jest.mock('@resgrid/auth', () => require('./auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));

const mockFetch = fetchPendingApproval as jest.Mock;
const mockApprove = approvePendingRequest as jest.Mock;
const mockDeny = denyPendingRequest as jest.Mock;

const pending = (overrides: Partial<PendingApprovalData> = {}): PendingApprovalData => ({
  ApprovalRequestId: 'req-1',
  RequestingApp: 'unit',
  InstallationLabel: 'Engine 12',
  Shared: true,
  Department: 'Station 1',
  Purpose: 'login',
  Operation: null,
  OriginRegion: 'Reno, NV',
  CreatedAt: null,
  ExpiresAt: null,
  AttemptsRemaining: 3,
  ...overrides,
});

describe('ApproveSignInScreen', () => {
  beforeEach(() => {
    resetFakeAuth();
    activateTestVariant('responder');
  });

  it('shows the request and approves with the number from the other screen', async () => {
    mockFetch.mockResolvedValue(pending());
    mockApprove.mockResolvedValueOnce({ ok: true, state: 'approved' });
    render(<ApproveSignInScreen />);
    expect(await screen.findByText('mfa.approve.purpose.login')).toBeTruthy();
    expect(screen.getByText('mfa.approve.app [app=Resgrid Unit]')).toBeTruthy();
    expect(screen.getByText('mfa.approve.installation [label=Engine 12]')).toBeTruthy();

    expect(screen.getByTestId('approve-confirm')).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('mfa.approve.number_placeholder'), '42');
    fireEvent.press(screen.getByRole('button', { name: 'mfa.approve.approve' }));
    expect(await screen.findByTestId('approve-approved')).toBeTruthy();
    expect(mockApprove).toHaveBeenCalledWith('req-1', '42');
  });

  it('reports a wrong number with the attempts left', async () => {
    mockFetch.mockResolvedValueOnce(pending()).mockResolvedValueOnce(pending({ AttemptsRemaining: 2 }));
    mockApprove.mockResolvedValueOnce({ ok: false, code: 'approval_number_mismatch' });
    render(<ApproveSignInScreen />);
    fireEvent.changeText(await screen.findByTestId('approve-number'), '17');
    fireEvent.press(screen.getByTestId('approve-confirm'));
    expect(await screen.findByText('mfa.approve.number_mismatch [count=2]')).toBeTruthy();
  });

  it('denies, and reports "This wasn\'t me"', async () => {
    mockFetch.mockResolvedValue(pending());
    mockDeny.mockResolvedValue({ ok: true, state: 'denied' });
    render(<ApproveSignInScreen />);
    fireEvent.press(await screen.findByTestId('approve-not-me'));
    expect(await screen.findByTestId('approve-denied')).toBeTruthy();
    expect(mockDeny).toHaveBeenCalledWith('req-1', 'not_me');
  });

  it('says when nothing is waiting, and finishes with Done', async () => {
    mockFetch.mockResolvedValue(null);
    const onDone = jest.fn();
    render(<ApproveSignInScreen onDone={onDone} />);
    expect(await screen.findByTestId('approve-none')).toBeTruthy();
    fireEvent.press(screen.getByTestId('approve-done'));
    expect(onDone).toHaveBeenCalled();
  });

  it('never asks the server in a variant that does not approve sign-ins', async () => {
    activateTestVariant('unit');
    render(<ApproveSignInScreen />);
    await waitFor(() => expect(screen.getByTestId('approve-none')).toBeTruthy());
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
