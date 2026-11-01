import { registerPreservedKeys } from '@resgrid/offline';
import { create } from 'zustand';

import { mainKv, onAuthStorageBound } from '../runtime/storage';
import { authCapabilities } from '../runtime/variant';

/**
 * Whether this installation is a shared device (passkey plan section 10.5), and the label its sessions carry. An
 * installation setting, not a user setting: it survives sign-out (preserved on every wipe), and it only ever asks the
 * server for the stricter shared session (department policy can make any session shared anyway). Only variants with
 * `capabilities.auth.sharedDevice` (Unit, IC, Dispatch) can be a shared installation.
 */
export const SHARED_INSTALLATION_STORAGE_KEY = 'SHARED_INSTALLATION';

// A device setting, like language and theme: never wiped by sign-out, a department switch or a server switch.
registerPreservedKeys([SHARED_INSTALLATION_STORAGE_KEY]);

export interface SharedInstallationSetting {
  /** False until someone chooses on the shared device screen; a device nobody has set up is a personal one. */
  configured: boolean;
  shared: boolean;
  /** Shown in the member's session list and on the approver's screen instead of the device model ("Engine 12 MDT"). */
  label: string | null;
}

const MAX_LABEL_LENGTH = 64;

export const sanitizeInstallationLabel = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, MAX_LABEL_LENGTH).trim();
};

const NOT_CONFIGURED: SharedInstallationSetting = { configured: false, shared: false, label: null };

const variantAllowsSharedDevice = (): boolean => {
  try {
    return authCapabilities().sharedDevice;
  } catch {
    return false;
  }
};

export const parseSharedInstallation = (raw: string | undefined | null): SharedInstallationSetting => {
  try {
    if (!raw) {
      return NOT_CONFIGURED;
    }
    const parsed = JSON.parse(raw) as Partial<SharedInstallationSetting>;
    return { configured: true, shared: parsed.shared === true, label: sanitizeInstallationLabel(parsed.label) };
  } catch {
    // An unreadable setting is a personal installation; the server still applies department policy.
    return NOT_CONFIGURED;
  }
};

const readStored = (): SharedInstallationSetting => {
  const setting = parseSharedInstallation(mainKv()?.getString(SHARED_INSTALLATION_STORAGE_KEY));
  return setting.shared && !variantAllowsSharedDevice() ? { ...setting, shared: false } : setting;
};

/** Reactive copy of the setting (the shared-device screen saves it while the login screen stays mounted). */
export const sharedInstallationStore = create<SharedInstallationSetting>()(() => ({ ...NOT_CONFIGURED }));

onAuthStorageBound(() => sharedInstallationStore.setState(readStored(), true));

export const readSharedInstallation = (): SharedInstallationSetting => sharedInstallationStore.getState();

export const isSharedInstallation = (): boolean => readSharedInstallation().shared;

export const useSharedInstallation = (): SharedInstallationSetting => sharedInstallationStore((state) => state);

export const saveSharedInstallation = (setting: { shared: boolean; label: string | null }): SharedInstallationSetting => {
  const saved = { shared: setting.shared === true && variantAllowsSharedDevice(), label: sanitizeInstallationLabel(setting.label) };
  mainKv()?.set(SHARED_INSTALLATION_STORAGE_KEY, JSON.stringify(saved));
  const next = { configured: true, ...saved };
  sharedInstallationStore.setState(next, true);
  return next;
};
