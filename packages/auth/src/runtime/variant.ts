import { type Capabilities, getActiveVariant, type VariantManifest } from '@resgrid/config';

/** The active variant manifest (set by the variant root layout before anything signs in). */
export const authManifest = (): VariantManifest => getActiveVariant();

/** The OAuth `client_id` and `X-Resgrid-Client` value (frozen per variant: `responder`, `unit`, `ic`, `dispatch`, `bigboard`). */
export const resgridClientId = (): string => authManifest().identity.clientId;

/** The scheme the server's return-target registry lists for this app's SSO (`<scheme>://sso-return`). */
export const ssoReturnScheme = (): string => {
  const manifest = authManifest();
  return manifest.identity.ssoReturnScheme ?? manifest.identity.schemes[0].toLowerCase();
};

export const authCapabilities = (): Capabilities['auth'] => authManifest().capabilities.auth;

/** Responder approves other apps' sign-ins (`capabilities.push.approveSignIns`). */
export const canApproveSignIns = (): boolean => authManifest().capabilities.push.approveSignIns;

/** Passkey relying-party domains from `webcredentials:` associated domains (iOS) — the same list the Android asset links serve. */
export const passkeyDomains = (): string[] =>
  authManifest()
    .identity.ios.associatedDomains.filter((entry) => entry.startsWith('webcredentials:'))
    .map((entry) => entry.substring('webcredentials:'.length).split('?')[0].toLowerCase());
