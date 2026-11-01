import '../../status/__tests__/test-setup';

import { dataProtectionStore, ProtectedFieldIds, useAuthStore } from '@resgrid/auth';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { ProtectedRevealBar } from '../components/protected-reveal-bar';
import { ProtectedText } from '../components/protected-text';
import { StepUpPrompt } from '../components/step-up-prompt';
import { displayableValue, withoutRedacted } from '../lib/redaction';

const mockEnsureGrant = jest.fn();
const mockOpenStepUpPrompt = jest.fn();
const mockVerifyStepUpOtp = jest.fn();
jest.mock('@resgrid/auth', () => {
  const actual = jest.requireActual('@resgrid/auth');
  return {
    ...actual,
    ensureGrant: () => mockEnsureGrant(),
    openStepUpPrompt: () => mockOpenStepUpPrompt(),
    verifyStepUpOtp: (code: string) => mockVerifyStepUpOtp(code),
    loadStepUpMethods: jest.fn(async () => undefined),
  };
});

const enableProtection = () =>
  dataProtectionStore.setState({ capabilities: { isProtectionEnabled: true, stepUpWindowMinutes: 10, isDepartmentLocked: false, lockReason: null }, grantToken: null, stepUpExpiresAt: null, lastError: null });

beforeEach(() => {
  mockEnsureGrant.mockReset();
  mockOpenStepUpPrompt.mockReset();
  mockVerifyStepUpOtp.mockReset();
  dataProtectionStore.setState({ capabilities: null, grantToken: null, stepUpExpiresAt: null, lastError: null, stepUpMethods: null, isVerifying: false, isRequestingGrant: false });
});

describe('ProtectedText', () => {
  it('shows the protected label instead of the REDACTED sentinel', () => {
    render(<ProtectedText value="REDACTED" fieldId={ProtectedFieldIds.contactEmail} />);
    expect(screen.queryByText('REDACTED')).toBeNull();
    expect(screen.getByText('data_protection.protected_value')).toBeTruthy();
  });

  it('trusts the RedactedFields list over the sentinel', () => {
    // A member may type "REDACTED" into a note: with a list that does not name the field it is data.
    const { rerender } = render(<ProtectedText value="REDACTED" fieldId={ProtectedFieldIds.callNotes} redactedFields={[]} />);
    expect(screen.getByText('REDACTED')).toBeTruthy();

    rerender(<ProtectedText value="Jane" fieldId={ProtectedFieldIds.contactFirstName} redactedFields={['Contacts.FirstName']} />);
    expect(screen.queryByText('Jane')).toBeNull();
    expect(screen.getByTestId(`protected-field-${ProtectedFieldIds.contactFirstName}`)).toBeTruthy();
  });

  it('strips withheld values from records', () => {
    expect(withoutRedacted({ Email: 'REDACTED', Name: 'Acme' })).toEqual({ Email: undefined, Name: 'Acme', WithheldFields: ['Email'] });
    expect(displayableValue('REDACTED')).toBeNull();
    expect(displayableValue('555-1234', ProtectedFieldIds.contactCellPhone, [])).toBe('555-1234');
  });
});

describe('ProtectedRevealBar', () => {
  it('renders nothing when the department is not protected', () => {
    render(<ProtectedRevealBar onRefresh={jest.fn()} />);
    expect(screen.queryByTestId('protected-reveal-bar')).toBeNull();
  });

  it('re-reads the screen once a grant is obtained silently', async () => {
    enableProtection();
    mockEnsureGrant.mockResolvedValueOnce('granted');
    const onRefresh = jest.fn();
    render(<ProtectedRevealBar onRefresh={onRefresh} />);

    fireEvent.press(screen.getByTestId('protected-reveal-button'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(mockOpenStepUpPrompt).not.toHaveBeenCalled();
  });

  it('opens the step-up prompt when a second factor is required', async () => {
    enableProtection();
    mockEnsureGrant.mockResolvedValueOnce('step_up_required');
    render(<ProtectedRevealBar onRefresh={jest.fn()} />);

    fireEvent.press(screen.getByTestId('protected-reveal-button'));
    await waitFor(() => expect(mockOpenStepUpPrompt).toHaveBeenCalled());
  });

  it('conceals and re-reads without the grant', async () => {
    enableProtection();
    useAuthStore.setState({ status: 'signedIn' });
    dataProtectionStore.setState({ grantToken: 'grant', stepUpExpiresAt: Date.now() + 60_000 });
    const onRefresh = jest.fn();
    render(<ProtectedRevealBar onRefresh={onRefresh} />);

    fireEvent.press(screen.getByTestId('protected-conceal-button'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(dataProtectionStore.getState().grantToken).toBeNull();
  });
});

describe('StepUpPrompt', () => {
  const q = { includeHiddenElements: true } as const;

  it('verifies the code, clears it and closes on success', async () => {
    mockVerifyStepUpOtp.mockResolvedValueOnce(true);
    const onClose = jest.fn();
    const onVerified = jest.fn();
    render(<StepUpPrompt isOpen onClose={onClose} onVerified={onVerified} />);

    fireEvent.changeText(screen.getByTestId('step-up-code-input', q), ' 123456 ');
    fireEvent.press(screen.getByTestId('step-up-submit', q));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockVerifyStepUpOtp).toHaveBeenCalledWith('123456');
    expect(onVerified).toHaveBeenCalled();
  });

  it('shows the translated error for an invalid code', () => {
    dataProtectionStore.setState({ lastError: 'invalid_totp' });
    render(<StepUpPrompt isOpen onClose={jest.fn()} />);
    expect(screen.getByTestId('step-up-error', q)).toHaveTextContent('data_protection.step_up_invalid_code');
  });
});
