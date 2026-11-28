import '../../status/__tests__/test-setup';

import { type AreaStepUpOptionsData, cancelStepUp, dataProtectionStore, resetStepUp, type StepUpRequirement, stepUpStore } from '@resgrid/auth';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { stepUpErrorKey, StepUpSheet, StepUpSheetHost } from '../components/step-up-sheet';

const mockVerifyCode = jest.fn();
const mockVerifyPassword = jest.fn();
const mockVerifyPasskey = jest.fn();
const mockStartApproval = jest.fn();
const mockVerifyProvider = jest.fn();
const mockVerifySso = jest.fn();
const mockRequestStepUp = jest.fn();

jest.mock('@resgrid/auth', () => {
  const actual = jest.requireActual('@resgrid/auth');

  return {
    ...actual,
    // This device has passkeys: the sheet shows what the department allows, and the platform supports.
    offeredMethods: (requirement: StepUpRequirement, options: AreaStepUpOptionsData | null) => actual.offeredMethods(requirement, options, true),
    verifyStepUpCode: (code: string) => mockVerifyCode(code),
    verifyStepUpPassword: (password: string) => mockVerifyPassword(password),
    verifyStepUpPasskey: () => mockVerifyPasskey(),
    startStepUpApproval: (onNumber: (n: string) => void, signal?: AbortSignal) => mockStartApproval(onNumber, signal),
    verifyStepUpProvider: () => mockVerifyProvider(),
    verifyStepUpSso: () => mockVerifySso(),
    requestStepUp: (requirement: StepUpRequirement) => mockRequestStepUp(requirement),
  };
});

const requirement = (overrides: Partial<StepUpRequirement> = {}): StepUpRequirement => ({
  area: 'acknowledgments',
  required: true,
  allowedMethods: ['mfa', 'sso', 'password'],
  usableMethods: ['mfa', 'sso', 'password'],
  mfaMethods: ['totp', 'passkey', 'passkey_approval', 'federated'],
  windowMinutes: 15,
  canComplete: true,
  ...overrides,
});

const options = (overrides: Partial<AreaStepUpOptionsData> = {}): AreaStepUpOptionsData => ({
  Area: 'acknowledgments',
  Required: true,
  AllowedMethods: ['mfa', 'sso', 'password'],
  UsableMethods: ['mfa', 'sso', 'password'],
  MfaMethods: ['totp', 'passkey', 'passkey_approval', 'federated'],
  WindowMinutes: 15,
  CanComplete: true,
  ...overrides,
});

let sheetIds = 0;

/** Opens a new sheet (each one its own id, as the step-up flow gives them). */
const open = (req: StepUpRequirement = requirement(), opts: AreaStepUpOptionsData | null = options()) => {
  sheetIds += 1;

  return act(() => stepUpStore.setState({ pending: { id: sheetIds, requirement: req, options: opts }, lastError: null, isVerifying: false }));
};

beforeEach(() => {
  activateVariant('responder');
  resetStepUp();

  for (const mock of [mockVerifyCode, mockVerifyPassword, mockVerifyPasskey, mockStartApproval, mockVerifyProvider, mockVerifySso, mockRequestStepUp]) mock.mockReset().mockResolvedValue(true);
  jest.mocked(router.push).mockClear();
});

describe('StepUpSheet', () => {
  it('renders nothing until a step-up is asked for', async () => {
    await render(<StepUpSheet />);
    expect(screen.queryByTestId('step-up-sheet', hidden)).toBeNull();
  });

  it('offers every method the department allows, and sends the trimmed code', async () => {
    await render(<StepUpSheet />);
    await open();
    expect(screen.getByText('step_up.area.acknowledgments', hidden)).toBeTruthy();

    for (const id of ['step-up-code-input', 'step-up-passkey', 'step-up-approval', 'step-up-provider', 'step-up-sso', 'step-up-switch-secret']) expect(screen.getByTestId(id, hidden)).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('step-up-code-input', hidden), ' 123456 ');
    await fireEvent.press(screen.getByTestId('step-up-submit', hidden));
    expect(mockVerifyCode).toHaveBeenCalledWith('123456');
    // The code leaves the field as soon as it is sent.
    expect(screen.getByTestId('step-up-code-input', hidden).props.value).toBe('');
  });

  it('switches to the password where the department allows it, and sends it as typed', async () => {
    await render(<StepUpSheet />);
    await open();
    await fireEvent.press(screen.getByTestId('step-up-switch-secret', hidden));
    const field = screen.getByTestId('step-up-password-input', hidden);
    expect(field.props.secureTextEntry).toBe(true);
    await fireEvent.changeText(field, ' pass word ');
    await fireEvent.press(screen.getByTestId('step-up-submit', hidden));
    expect(mockVerifyPassword).toHaveBeenCalledWith(' pass word ');
  });

  it('clears what was typed when switching between the code and the password, so a password never shows as a code', async () => {
    await render(<StepUpSheet />);
    await open();
    await fireEvent.press(screen.getByTestId('step-up-switch-secret', hidden));
    await fireEvent.changeText(screen.getByTestId('step-up-password-input', hidden), 'hunter2');
    await fireEvent.press(screen.getByTestId('step-up-switch-secret', hidden));
    const code = screen.getByTestId('step-up-code-input', hidden);
    expect(code.props.secureTextEntry).toBe(false);
    expect(code.props.value).toBe('');

    await fireEvent.changeText(code, '1234');
    await fireEvent.press(screen.getByTestId('step-up-switch-secret', hidden));
    expect(screen.getByTestId('step-up-password-input', hidden).props.value).toBe('');
  });

  it('starts every new sheet empty: nothing typed for one area carries over to the next', async () => {
    await render(<StepUpSheet />);
    await open();
    await fireEvent.press(screen.getByTestId('step-up-switch-secret', hidden));
    await fireEvent.changeText(screen.getByTestId('step-up-password-input', hidden), 'hunter2');

    // The sheet is replaced by the next area's without closing in between (cancel opens the queued one at once).
    await open(requirement({ area: 'signatures' }));
    expect(screen.getByText('step_up.area.signatures', hidden)).toBeTruthy();
    expect(screen.queryByTestId('step-up-password-input', hidden)).toBeNull();
    expect(screen.getByTestId('step-up-code-input', hidden).props.value).toBe('');
  });

  it('offers only the password and SSO when that is all the member can use (an SSO department without 2FA)', async () => {
    await render(<StepUpSheet />);
    await open(requirement({ usableMethods: ['sso', 'password'], mfaMethods: [] }), options({ UsableMethods: ['sso', 'password'], MfaMethods: [] }));
    expect(screen.getByTestId('step-up-password-input', hidden)).toBeTruthy();
    expect(screen.getByTestId('step-up-sso', hidden)).toBeTruthy();

    for (const id of ['step-up-code-input', 'step-up-passkey', 'step-up-approval', 'step-up-provider', 'step-up-switch-secret']) expect(screen.queryByTestId(id, hidden)).toBeNull();
  });

  it('runs the passkey, provider MFA and SSO re-auth in the app', async () => {
    await render(<StepUpSheet />);
    await open();
    await fireEvent.press(screen.getByTestId('step-up-passkey', hidden));
    await fireEvent.press(screen.getByTestId('step-up-provider', hidden));
    await fireEvent.press(screen.getByTestId('step-up-sso', hidden));
    expect(mockVerifyPasskey).toHaveBeenCalledTimes(1);
    expect(mockVerifyProvider).toHaveBeenCalledTimes(1);
    expect(mockVerifySso).toHaveBeenCalledTimes(1);
  });

  it('shows the approval number while Responder decides, and can stop waiting', async () => {
    let signal: AbortSignal | undefined;
    mockStartApproval.mockImplementation((onNumber: (n: string) => void, abort?: AbortSignal) => {
      signal = abort;
      onNumber('42');

      return new Promise<boolean>((resolve) => abort?.addEventListener('abort', () => resolve(false)));
    });
    await render(<StepUpSheet />);
    await open();
    await fireEvent.press(screen.getByTestId('step-up-approval', hidden));
    expect(screen.getByTestId('step-up-approval-number', hidden)).toHaveTextContent('42');
    await fireEvent.press(screen.getByTestId('step-up-approval-cancel', hidden));
    await waitFor(() => expect(screen.queryByTestId('step-up-approval-panel', hidden)).toBeNull());
    expect(signal?.aborted).toBe(true);
  });

  it('tells a member with nothing usable to set up 2FA, with a way to do it in the app', async () => {
    await render(<StepUpSheet />);
    await open(requirement({ usableMethods: [], mfaMethods: [], canComplete: false }), options({ UsableMethods: [], MfaMethods: [], CanComplete: false }));
    expect(screen.getByText('step_up.enroll_needed', hidden)).toBeTruthy();
    expect(screen.queryByTestId('step-up-code-input', hidden)).toBeNull();
    await fireEvent.press(screen.getByTestId('step-up-enroll', hidden));
    expect(router.push).toHaveBeenCalledWith('/settings/account-security');
    expect(stepUpStore.getState().pending).toBeNull();
  });

  it('has no enroll button in an app without account security (BigBoard keeps the explanation)', async () => {
    activateVariant('bigboard', { auth: { mfa: false, passkeys: false } });
    await render(<StepUpSheet />);
    await open(requirement({ usableMethods: [], mfaMethods: [], canComplete: false }), options({ UsableMethods: [], MfaMethods: [], CanComplete: false }));
    expect(screen.getByTestId('step-up-cannot-complete', hidden)).toBeTruthy();
    expect(screen.queryByTestId('step-up-enroll', hidden)).toBeNull();
  });

  it('waits for the methods when the sheet opened without them, and says why when they cannot be loaded', async () => {
    await render(<StepUpSheet />);
    await open(requirement({ area: 'protected_data', usableMethods: [], mfaMethods: [] }), null);
    expect(screen.getByTestId('step-up-loading', hidden)).toBeTruthy();
    expect(screen.queryByTestId('step-up-cannot-complete', hidden)).toBeNull();
    await act(() => stepUpStore.setState({ lastError: 'network' }));
    expect(screen.queryByTestId('step-up-loading', hidden)).toBeNull();
    expect(screen.getByTestId('step-up-error', hidden)).toHaveTextContent('step_up.errors.network');
  });

  it('shows the message for each refusal, the rate limit and password_not_available included', async () => {
    await render(<StepUpSheet />);
    await open();
    await act(() => stepUpStore.setState({ lastError: 'too_many_attempts' }));
    expect(screen.getByTestId('step-up-error', hidden)).toHaveTextContent('step_up.errors.too_many_attempts');
    expect(stepUpErrorKey('password_not_available')).toBe('step_up.errors.password_not_available');
    expect(stepUpErrorKey('invalid_totp')).toBe('step_up.errors.invalid_code');
    expect(stepUpErrorKey('sso_reauthentication_not_satisfied')).toBe('step_up.errors.sso_not_satisfied');
    expect(stepUpErrorKey('passkey_cancelled')).toBe('mfa.errors.passkey_cancelled');
    expect(stepUpErrorKey('something_new')).toBe('step_up.errors.failed');
  });

  it('closing the sheet tells the waiting request it was not verified', async () => {
    await render(<StepUpSheet />);
    await open();
    await fireEvent.press(screen.getByTestId('step-up-cancel', hidden));
    expect(stepUpStore.getState()).toMatchObject({ pending: null, dismissedAreas: ['acknowledgments'] });
  });
});

describe('StepUpSheetHost', () => {
  it('verifies a protected-data reveal through the same sheet, then closes the reveal prompt', async () => {
    let settle: (verified: boolean) => void = () => undefined;
    mockRequestStepUp.mockImplementation(() => new Promise<boolean>((resolve) => (settle = resolve)));
    await render(<StepUpSheetHost />);
    await act(() => dataProtectionStore.setState({ isPromptOpen: true }));
    expect(mockRequestStepUp).toHaveBeenCalledWith(expect.objectContaining({ area: 'protected_data' }));
    await act(async () => settle(true));
    expect(dataProtectionStore.getState().isPromptOpen).toBe(false);
    cancelStepUp();
  });
});
