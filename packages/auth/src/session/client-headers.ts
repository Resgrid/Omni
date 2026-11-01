import { type DeviceLabelProvider, expoDeviceLabels } from '../runtime/device-info';
import { resgridClientId } from '../runtime/variant';
import { readSharedInstallation } from './shared-installation';

export const CLIENT_HEADER = 'X-Resgrid-Client';
export const SHARED_INSTALLATION_HEADER = 'X-Resgrid-Shared-Installation';
export const OPERATOR_ACTIVITY_HEADER = 'X-Resgrid-Operator-Activity';
export const PROTECTED_GRANT_HEADER = 'X-Resgrid-Protected-Grant';

const MAX_HEADER_LENGTH = 64;

/** A header value the platform HTTP stack will send: printable ASCII only, trimmed and bounded. */
export const headerSafe = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const ascii = value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .trim();
  return ascii.length === 0 ? null : ascii.slice(0, MAX_HEADER_LENGTH).trim();
};

let deviceLabels: DeviceLabelProvider = expoDeviceLabels;

/** The shell may supply its own labels (e.g. Electron's machine name); defaults to expo-device / expo-application. */
export function setDeviceLabelProvider(provider: DeviceLabelProvider | null): void {
  deviceLabels = provider ?? expoDeviceLabels;
}

/**
 * The app and installation headers (passkey plan sections 10.4 and 10.5): which Resgrid app this is (the server binds
 * sign-in transactions, passkeys, brokered SSO, recovery and the refresh-token lifetime to it), whether this is a shared
 * installation, and labels for the member's own session list. Sent on every request, anonymous ones included — the token
 * endpoint and the transaction calls are where a session is created. Never `X-Resgrid-ApiKey`.
 */
export const clientHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { [CLIENT_HEADER]: resgridClientId() };
  const installation = readSharedInstallation();
  if (installation.shared) {
    headers[SHARED_INSTALLATION_HEADER] = 'true';
  }
  let labels;
  try {
    labels = deviceLabels();
  } catch {
    labels = null;
  }
  if (labels) {
    const values: Record<string, string | null> = {
      'X-Resgrid-Device-Name': headerSafe(installation.label) ?? headerSafe(labels.deviceName ?? labels.modelName),
      'X-Resgrid-Device-Type': headerSafe(labels.modelName),
      'X-Resgrid-Operating-System': headerSafe(`${labels.osName} ${labels.osVersion ?? ''}`),
      'X-Resgrid-App-Version': headerSafe(labels.appVersion),
    };
    for (const [name, value] of Object.entries(values)) {
      if (value) {
        headers[name] = value;
      }
    }
  }
  return headers;
};

/**
 * Whether the provider's sign-in should run in a browser session that keeps no cookies. A shared installation always
 * does, so the next operator can never ride on the last one's provider session (Responder, a personal app, keeps it).
 */
export const ephemeralBrowser = (): boolean => readSharedInstallation().shared;
