import type { WebAuthnOptions } from '../mfa/types';
import { authCapabilities, passkeyDomains } from '../runtime/variant';

/** Whether this variant offers passkeys at all (`capabilities.auth.passkeys`); the platform support check comes on top. */
export const passkeysEnabledForVariant = (): boolean => {
  try {
    return authCapabilities().passkeys;
  } catch {
    return false;
  }
};

/** The relying-party id the server's options name (`rpId` for an assertion, `rp.id` for a registration). */
export const relyingPartyIdOf = (options: WebAuthnOptions): string | null => {
  const direct = options.rpId;
  if (typeof direct === 'string' && direct.length > 0) {
    return direct.toLowerCase();
  }
  const rp = options.rp as { id?: unknown } | undefined;
  return typeof rp?.id === 'string' && rp.id.length > 0 ? rp.id.toLowerCase() : null;
};

/**
 * On iOS and Android the OS only runs a passkey prompt for a relying party the app is associated with (the variant's
 * `webcredentials:` associated domains / asset links). A self-hosted server's own domain is never one of them, and the
 * OS refusal is an opaque error, so the mismatch is caught here and reported as "not supported" with a clear reason.
 * Options without an rpId (the platform then uses the app's own) pass.
 */
export const isRelyingPartyAssociated = (options: WebAuthnOptions, domains: readonly string[] = passkeyDomains()): boolean => {
  const rpId = relyingPartyIdOf(options);
  if (!rpId) {
    return true;
  }
  return domains.some((domain) => domain === rpId || domain.endsWith(`.${rpId}`));
};
