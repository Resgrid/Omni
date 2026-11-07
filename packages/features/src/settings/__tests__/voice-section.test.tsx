/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import './test-setup';

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { VoiceSection } from '../sections/voice-section';
import { mockSetHeadsetButtonPttEnabled, mockVoiceCapabilities, mockVoiceStore } from './native-mocks';
import { activateTestVariant } from './variant';

jest.mock('@resgrid/auth', () => require('../../auth-ui/__tests__/auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));

jest.mock('@resgrid/voice', () => require('./native-mocks').voiceModule());

jest.mock('../../auth-ui/lib/api-context', () => ({ authUiApi: () => ({}), hasAuthUiApi: () => false }));

beforeEach(() => {
  mockSetHeadsetButtonPttEnabled.mockClear();
  mockVoiceStore.setState({ mediaButtonPTTSettings: { enabled: true } });
  mockVoiceCapabilities.headsetButtonPtt = true;
});

// The earbud / headset call button talks by default; members who want it to leave the channel turn it off here.
describe('VoiceSection: talk with the earbud button', () => {
  it.each(['responder', 'unit', 'ic', 'dispatch'] as const)('%s shows the switch, on, explains it and saves a change', async (variant) => {
    activateTestVariant(variant);
    await render(<VoiceSection />);

    const toggle = screen.getByTestId('settings-headset-button-ptt');
    expect(toggle.props.value).toBe(true);
    expect(screen.getByTestId('settings-headset-button-ptt-note')).toHaveTextContent('settings.headset_button_ptt_note');

    await fireEvent(toggle, 'onValueChange', false);
    expect(mockSetHeadsetButtonPttEnabled).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('settings-headset-button-ptt').props.value).toBe(false);
    expect(screen.queryByTestId('settings-headset-button-ptt-note')).toBeNull();
  });

  it('is left out where headset buttons do not drive push-to-talk (web, Electron)', async () => {
    activateTestVariant('dispatch');
    mockVoiceCapabilities.headsetButtonPtt = false;
    await render(<VoiceSection />);
    expect(screen.queryByTestId('settings-headset-button-ptt')).toBeNull();
    expect(screen.getByTestId('settings-microphone')).toBeTruthy();
  });
});
