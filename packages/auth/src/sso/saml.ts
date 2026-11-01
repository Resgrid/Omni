import { createExpoSecureKeyStore, registerStoreReset, type SecureKeyStore } from '@resgrid/offline';
import * as WebBrowser from 'expo-web-browser';

import { randomUUID } from '../runtime/crypto';
import { authLogger } from '../runtime/logger';
import { isWebPlatform } from '../runtime/platform';
import { mainKv } from '../runtime/storage';
import { resgridClientId } from '../runtime/variant';
import { useAuthStore } from '../session/auth-store';
import { desktopLegacySso } from './legacy-sso-desktop';
import { isValidSsoUrl } from './sso-url';

// ---------------------------------------------------------------------------------------------------------------------
// Legacy SAML 2.0 sign-in (Responder): the server's SAML start page sends the browser to the department's IdP; the IdP
// posts to the shared ACS (`connect/saml-mobile-callback`), whose relay returns to the app named in the RelayState
// (`<clientId>.<nonce>`) with `saml_response`, the echoed `relay_state` and the department token. A callback whose
// relay_state is not this app's pending one is refused (login CSRF). The pending state lives in the secure store with a
// 10-minute lifetime; the department token for a cold-start callback in MMKV.
// ---------------------------------------------------------------------------------------------------------------------

export const PENDING_SAML_STATE_KEY = 'pending_saml_state';
export const PENDING_SAML_DEPT_TOKEN_KEY = 'pending_saml_dept_token';
export const PENDING_SAML_STATE_TTL_MS = 10 * 60 * 1000;

interface PendingSamlState {
  state: string;
  createdAt: number;
}

let secureStore: SecureKeyStore | null = null;

/** Tests and web inject their own; native defaults to expo-secure-store. Web keeps the pending state in this origin's storage. */
export function setSamlStateStore(store: SecureKeyStore | null): void {
  secureStore = store;
}

const kvStateStore: SecureKeyStore = {
  getItem: async (name) => mainKv()?.getString(name) ?? null,
  setItem: async (name, value) => {
    mainKv()?.set(name, value);
  },
  deleteItem: async (name) => {
    mainKv()?.delete(name);
  },
};

const stateStore = (): SecureKeyStore => {
  if (!secureStore) {
    secureStore = isWebPlatform() ? kvStateStore : createExpoSecureKeyStore();
  }
  return secureStore;
};

export async function clearPendingSamlState(): Promise<void> {
  await stateStore()
    .deleteItem(PENDING_SAML_STATE_KEY)
    .catch(() => undefined);
}

// A pending sign-in is a credential in waiting: sign-out (every wipe) drops it.
registerStoreReset('auth.saml', () => clearPendingSamlState());

const consumePendingSamlState = async (callbackState: string | null, now: number): Promise<boolean> => {
  let raw: string | null;
  try {
    raw = await stateStore().getItem(PENDING_SAML_STATE_KEY);
  } catch {
    return false;
  }
  if (!raw) {
    authLogger.warn({ message: 'SAML: no pending sign-in; ignoring the callback' });
    return false;
  }
  let pending: Partial<PendingSamlState>;
  try {
    pending = JSON.parse(raw) as Partial<PendingSamlState>;
  } catch {
    await clearPendingSamlState();
    return false;
  }
  if (!pending.state || typeof pending.createdAt !== 'number' || now - pending.createdAt > PENDING_SAML_STATE_TTL_MS || !callbackState || callbackState !== pending.state) {
    authLogger.warn({ message: 'SAML: callback state missing, expired or mismatched; ignoring it' });
    await clearPendingSamlState();
    return false;
  }
  return true;
};

/** The sign-in page with a one-time RelayState tagged with this app's client id. */
export async function prepareSamlSignIn(signInUrl: string, departmentToken: string | null, now: number = Date.now()): Promise<string | null> {
  if (!isValidSsoUrl(signInUrl)) {
    authLogger.warn({ message: 'SAML: refusing a non-https or malformed sign-in page' });
    return null;
  }
  const state = `${resgridClientId()}.${randomUUID()}`;
  await stateStore().setItem(PENDING_SAML_STATE_KEY, JSON.stringify({ state, createdAt: now } satisfies PendingSamlState));
  if (departmentToken) {
    mainKv()?.setJSON(PENDING_SAML_DEPT_TOKEN_KEY, departmentToken);
  }
  return `${signInUrl}${signInUrl.includes('?') ? '&' : '?'}RelayState=${encodeURIComponent(state)}`;
}

/** Opens the SAML sign-in (system browser; the desktop bridge on Electron, which hands the relay link straight back). */
export async function startSamlSignIn(signInUrl: string, departmentToken: string | null): Promise<'opened' | 'signed_in' | 'failed' | 'cancelled'> {
  const initiateUrl = await prepareSamlSignIn(signInUrl, departmentToken);
  if (!initiateUrl) {
    return 'failed';
  }
  const desktop = desktopLegacySso();
  if (desktop) {
    const result = await desktop.legacySsoSaml(initiateUrl).catch(() => ({ ok: false as const, reason: 'failed' as const }));
    if (!result.ok) {
      await clearPendingSamlState();
      return result.reason === 'cancelled' ? 'cancelled' : 'failed';
    }
    return (await handleSamlCallbackUrl(result.url)) ? 'signed_in' : 'failed';
  }
  await WebBrowser.openBrowserAsync(initiateUrl);
  return 'opened';
}

const queryOf = (url: string): URLSearchParams => new URLSearchParams(url.includes('?') ? url.substring(url.indexOf('?') + 1).split('#')[0] : '');

const readStoredDepartmentToken = (): string | null => {
  const raw = mainKv()?.getJSON<string>(PENDING_SAML_DEPT_TOKEN_KEY, { deleteOnCorrupt: true });
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
};

/**
 * Handles the relay's deep link (also on a cold start, from the root layout). Returns false for a link that is not a SAML
 * callback or fails the state check; true once the exchange signed in (or asked for a code).
 */
export async function handleSamlCallbackUrl(url: string, now: number = Date.now()): Promise<boolean> {
  const query = queryOf(url);
  const samlResponse = query.get('saml_response');
  if (!samlResponse) {
    return false;
  }
  if (!(await consumePendingSamlState(query.get('relay_state'), now))) {
    mainKv()?.delete(PENDING_SAML_DEPT_TOKEN_KEY);
    return false;
  }
  const departmentToken = query.get('department_token') || readStoredDepartmentToken();
  try {
    if (!departmentToken) {
      authLogger.warn({ message: 'SAML: no department token on the callback or in storage' });
      return false;
    }
    await useAuthStore.getState().loginWithExternalToken({ provider: 'saml2', externalToken: samlResponse, departmentToken });
    const state = useAuthStore.getState();
    return state.status === 'signedIn' || state.isSsoMfaPending;
  } finally {
    await clearPendingSamlState();
    mainKv()?.delete(PENDING_SAML_DEPT_TOKEN_KEY);
  }
}
