import * as WebBrowser from 'expo-web-browser';

import { toMfaProblem } from '../errors/mfa-errors';
import { randomBase64Url, s256Challenge } from '../mfa/pkce';
import type { SsoBeginData } from '../mfa/types';
import { isWebPlatform, platformOS } from '../runtime/platform';
import { ssoReturnScheme } from '../runtime/variant';
import { ephemeralBrowser } from '../session/client-headers';

// ---------------------------------------------------------------------------------------------------------------------
// One brokered SSO round trip (passkey plan section 7.7.2). The broker returns only a one-time code and this app's state
// to the registered return target; the PKCE verifier never leaves this app's memory until the code is redeemed, and no
// IdP token or assertion ever reaches the app. Dispatch's structure (bridge failures are failed round trips, never
// rejections) + Responder's `finally` that always closes the desktop listener; the return scheme comes from the manifest
// (Unit/IC hardcoded `resgridunit`).
// ---------------------------------------------------------------------------------------------------------------------

export interface SsoRoundTripSecrets {
  returnTarget: string;
  state: string;
  codeChallenge: string;
  platform: string;
}

export interface SsoRoundTrip {
  ssoTransactionId: string;
  ssoCode: string;
  codeVerifier: string;
}

export type SsoRoundTripResult = { ok: true; trip: SsoRoundTrip } | { ok: false; reason: 'cancelled' | 'denied' | 'failed' | 'state_mismatch' | 'refused'; code?: string };

/**
 * The desktop app's loopback bridge (electron/sso-loopback.js): a one-time listener on 127.0.0.1 receives the broker's
 * return, because a packaged desktop page cannot receive a browser redirect. Absent everywhere else.
 */
interface DesktopSso {
  ssoListen: () => Promise<{ id: string; returnTarget: string }>;
  ssoOpen: (id: string, authorizeUrl: string) => Promise<string | null>;
  ssoCancel: (id: string) => Promise<void>;
}

const desktopSso = (): DesktopSso | null => {
  const bridge = typeof window !== 'undefined' ? (window as unknown as { electronAPI?: Partial<DesktopSso> }).electronAPI : undefined;
  return bridge?.ssoListen && bridge.ssoOpen && bridge.ssoCancel ? (bridge as DesktopSso) : null;
};

/** This build's registered return target: `<manifest ssoReturnScheme>://sso-return`, or this site's `/sso-return` page on web. */
export const ssoReturnTarget = (): string => (isWebPlatform() && typeof window !== 'undefined' && window.location ? `${window.location.origin}/sso-return` : `${ssoReturnScheme()}://sso-return`);

export const ssoPlatform = (): string => (desktopSso() ? 'electron' : platformOS());

/** Parses the broker's return: `?sso_code=…&state=…` or `?error=…&state=…`. */
export const parseSsoReturn = (url: string): { ssoCode?: string; state?: string; error?: string } => {
  const query = url.includes('?') ? (url.substring(url.indexOf('?') + 1).split('#')[0] ?? '') : '';
  const parsed = new URLSearchParams(query);
  const one = (value: string | null): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);
  return { ssoCode: one(parsed.get('sso_code')), state: one(parsed.get('state')), error: one(parsed.get('error')) };
};

/**
 * Begins the round trip through `begin`, runs it in the system browser (an auth session, so the redirect comes straight
 * back to this app), and checks the state before handing back the code. `ephemeral` keeps the provider's cookies out of a
 * shared installation so the next operator cannot inherit the last one's provider session.
 */
export const runSsoRoundTrip = async (begin: (secrets: SsoRoundTripSecrets) => Promise<SsoBeginData>, ephemeral: boolean = ephemeralBrowser()): Promise<SsoRoundTripResult> => {
  const codeVerifier = randomBase64Url(32);
  const state = randomBase64Url(24);
  const desktop = desktopSso();
  let listener: { id: string; returnTarget: string } | null = null;
  try {
    listener = desktop ? await desktop.ssoListen() : null;
    const returnTarget = listener ? listener.returnTarget : ssoReturnTarget();

    let begun: SsoBeginData;
    try {
      begun = await begin({ returnTarget, state, codeChallenge: await s256Challenge(codeVerifier), platform: ssoPlatform() });
    } catch (error) {
      return { ok: false, reason: 'refused', code: toMfaProblem(error).code };
    }

    let returnedUrl: string | null;
    if (desktop && listener) {
      // The provider opens in the member's own browser; the loopback listener hands back its one return.
      returnedUrl = await desktop.ssoOpen(listener.id, begun.AuthorizeUrl);
    } else {
      const result = await WebBrowser.openAuthSessionAsync(begun.AuthorizeUrl, returnTarget, { preferEphemeralSession: ephemeral });
      returnedUrl = result.type === 'success' && 'url' in result && result.url ? result.url : null;
    }
    if (!returnedUrl) {
      return { ok: false, reason: 'cancelled' };
    }

    const returned = parseSsoReturn(returnedUrl);
    if (returned.state !== state) {
      return { ok: false, reason: 'state_mismatch' };
    }
    if (returned.error) {
      return { ok: false, reason: returned.error === 'access_denied' ? 'denied' : 'failed', code: returned.error };
    }
    if (!returned.ssoCode) {
      return { ok: false, reason: 'failed' };
    }

    return { ok: true, trip: { ssoTransactionId: begun.SsoTransactionId, ssoCode: returned.ssoCode, codeVerifier } };
  } catch {
    // The listener or the browser could not run (no browser on the device, another auth session already open, the
    // desktop bridge failing): a failed round trip, reported like any other rather than thrown at every caller.
    return { ok: false, reason: 'failed' };
  } finally {
    // The listener closes itself after its one return, so this is a no-op then; on every other way out it closes here.
    if (desktop && listener) {
      await desktop.ssoCancel(listener.id).catch(() => undefined);
    }
  }
};
