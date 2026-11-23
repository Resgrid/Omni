// Settings → Location applies at once (apps/omni/location-settings-wiring.ts): a saved preference re-syncs the location
// transmitter, so turning Background Geolocation on registers the background task without waiting for a resume.
import fs from 'node:fs';
import path from 'node:path';

import { wireLocationSettings } from '../location-settings-wiring';

jest.mock('@resgrid/features/settings', () => {
  const listeners = new Set<() => void>();

  return {
    subscribePreferences: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    mockNotifyPreferencesChanged: () => listeners.forEach((listener) => listener()),
  };
});

interface MockTransmitter {
  refresh: jest.Mock;
}

interface MockTransmitterSlot {
  current: MockTransmitter | null;
}

interface LogEntry {
  message: string;
}

const mockTransmitter: MockTransmitterSlot = { current: null };

jest.mock('@resgrid/location', () => ({ getLocationTransmitter: () => mockTransmitter.current }));

const mockWarn = jest.fn();

jest.mock('@resgrid/core', () => ({ logger: { warn: (entry: LogEntry) => mockWarn(entry) } }));

const notifyPreferencesChanged = (): void => {
  // SAFETY: the factory above adds this helper to the mocked module.
  (jest.requireMock('@resgrid/features/settings') as { mockNotifyPreferencesChanged: () => void }).mockNotifyPreferencesChanged();
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let undo: (() => void) | null = null;

beforeEach(() => {
  mockTransmitter.current = { refresh: jest.fn(async () => undefined) };
  mockWarn.mockClear();
});

afterEach(() => {
  undo?.();
  undo = null;
});

describe('wireLocationSettings', () => {
  it('re-syncs the transmitter when a preference is saved', () => {
    undo = wireLocationSettings();
    notifyPreferencesChanged();
    expect(mockTransmitter.current?.refresh).toHaveBeenCalledTimes(1);
  });

  it('subscribes once however often it is wired', () => {
    wireLocationSettings();
    undo = wireLocationSettings();
    notifyPreferencesChanged();
    expect(mockTransmitter.current?.refresh).toHaveBeenCalledTimes(1);
  });

  it('stops following after the undo', () => {
    wireLocationSettings()();
    notifyPreferencesChanged();
    expect(mockTransmitter.current?.refresh).not.toHaveBeenCalled();
  });

  it('does nothing before location is configured, and logs a refresh that fails', async () => {
    undo = wireLocationSettings();
    mockTransmitter.current = null;
    expect(() => notifyPreferencesChanged()).not.toThrow();

    mockTransmitter.current = { refresh: jest.fn(async () => Promise.reject(new Error('permission read failed'))) };
    notifyPreferencesChanged();
    await flush();
    expect(mockWarn).toHaveBeenCalledWith({ message: 'Location did not follow a Settings change; it will on the next resume' });
  });

  it('is wired by the shell registrations every app loads', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'shell-registrations.tsx'), 'utf8');
    expect(source).toMatch(/^wireLocationSettings\(\);$/m);
  });
});
