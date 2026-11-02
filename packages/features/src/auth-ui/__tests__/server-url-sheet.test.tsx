/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import '../../settings/__tests__/test-setup';

import { getStoredServerUrlProblem, switchServer } from '@resgrid/auth';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { activateTestVariant } from '../../settings/__tests__/variant';
import { ServerUrlSheet } from '../components/server-url-sheet';
import { fakeAuthStore, resetFakeAuth } from './auth-fake';

jest.mock('@resgrid/auth', () => require('./auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));
jest.mock('../lib/api-context', () => ({ authUiApi: () => ({}), hasAuthUiApi: () => false }));

const mockSwitchServer = switchServer as jest.Mock;

const renderSheet = async (props: Partial<React.ComponentProps<typeof ServerUrlSheet>> = {}) => {
  const onClose = jest.fn();
  const onChanged = jest.fn();
  await render(<ServerUrlSheet isOpen onClose={onClose} onChanged={onChanged} allowLocalHttp={false} {...props} />);
  await screen.findByTestId('server-option-US-West');
  return { onClose, onChanged };
};

describe('ServerUrlSheet', () => {
  beforeEach(() => {
    resetFakeAuth();
    activateTestVariant('dispatch');
  });

  it('lists the hosted sites plus Custom and preselects the current server', async () => {
    await renderSheet();
    expect(screen.getByTestId('server-option-US-West').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(screen.getByTestId('server-option-EU-Central')).toBeTruthy();
    expect(screen.getByTestId('server-option-__custom__')).toBeTruthy();
    expect(screen.queryByTestId('server-url-input')).toBeNull();
  });

  it('switches to a hosted site through switchServer and reports the change', async () => {
    const { onClose, onChanged } = await renderSheet();
    await fireEvent.press(screen.getByTestId('server-option-EU-Central'));
    await fireEvent.press(screen.getByTestId('server-url-save'));
    await waitFor(() => expect(mockSwitchServer).toHaveBeenCalledWith('https://api-eu-central.resgrid.com', false));
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ ok: true, changed: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it('rejects plain http to a remote host in a production build', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('server-option-__custom__'));
    await fireEvent.changeText(screen.getByTestId('server-url-input'), 'http://resgrid.example.org');
    await fireEvent.press(screen.getByTestId('server-url-save'));
    expect(await screen.findByText('settings.server_url_insecure')).toBeTruthy();
    expect(mockSwitchServer).not.toHaveBeenCalled();
  });

  it('rejects http even to localhost outside a development build', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('server-option-__custom__'));
    await fireEvent.changeText(screen.getByTestId('server-url-input'), 'http://localhost:5000');
    await fireEvent.press(screen.getByTestId('server-url-save'));
    expect(await screen.findByText('settings.server_url_insecure')).toBeTruthy();
    expect(mockSwitchServer).not.toHaveBeenCalled();
  });

  it('allows http to localhost in a development build', async () => {
    await renderSheet({ allowLocalHttp: true });
    await fireEvent.press(screen.getByTestId('server-option-__custom__'));
    await fireEvent.changeText(screen.getByTestId('server-url-input'), 'http://localhost:5000/api/v4');
    await fireEvent.press(screen.getByTestId('server-url-save'));
    await waitFor(() => expect(mockSwitchServer).toHaveBeenCalledWith('http://localhost:5000', true));
  });

  it('rejects an empty or malformed address', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('server-option-__custom__'));
    await fireEvent.changeText(screen.getByTestId('server-url-input'), '');
    await fireEvent.press(screen.getByTestId('server-url-save'));
    expect(await screen.findByText('settings.server_url_required')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('server-url-input'), 'not a url');
    await fireEvent.press(screen.getByTestId('server-url-save'));
    expect(await screen.findByText('settings.server_url_invalid')).toBeTruthy();
    expect(mockSwitchServer).not.toHaveBeenCalled();
  });

  it('saves a custom https server with the /api suffix removed', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('server-option-__custom__'));
    await fireEvent.changeText(screen.getByTestId('server-url-input'), 'https://resgrid.example.org/api/v4/');
    await fireEvent.press(screen.getByTestId('server-url-save'));
    await waitFor(() => expect(mockSwitchServer).toHaveBeenCalledWith('https://resgrid.example.org', false));
  });

  it('warns a signed-in member that switching signs them out, and reports a stored insecure server', async () => {
    (getStoredServerUrlProblem as jest.Mock).mockReturnValueOnce('insecure');
    fakeAuthStore.setState({ status: 'signedIn', accessToken: 'token' });
    await renderSheet();
    expect(screen.getByTestId('server-url-signout-note')).toBeTruthy();
    expect(screen.getByTestId('server-url-stored-problem')).toBeTruthy();
  });
});
