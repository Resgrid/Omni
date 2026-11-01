import { Passkey, type PasskeyCreateRequest, type PasskeyGetRequest } from 'react-native-passkey';

import type { WebAuthnOptions } from '../mfa/types';
import { authLogger } from '../runtime/logger';
import { PasskeyCeremonyError, type PasskeyCeremonyReason } from './passkey-errors';
import { isRelyingPartyAssociated, passkeysEnabledForVariant } from './passkey-policy';

// ---------------------------------------------------------------------------------------------------------------------
// Passkeys on iOS and Android (passkey workbook section 3: react-native-passkey over Credential Manager and
// ASAuthorization). The server issues the options for this app's own relying party and verifies the result; this only
// runs the platform prompt. Options and results are WebAuthn JSON with base64url values on both sides. Identical in
// R/U/I/D; gated by `capabilities.auth.passkeys` and checked against the variant's associated domains.
// ---------------------------------------------------------------------------------------------------------------------

const reasonFor = (error: unknown): PasskeyCeremonyReason => {
  const code = (error as { error?: string } | null)?.error;
  switch (code) {
    case 'UserCancelled':
    case 'Interrupted':
      return 'cancelled';
    case 'NotSupported':
    case 'BadConfiguration':
      return 'not_supported';
    case 'NoCredentials':
      return 'no_credentials';
    default:
      return 'failed';
  }
};

export const passkeysSupported = (): boolean => {
  if (!passkeysEnabledForVariant()) {
    return false;
  }
  try {
    return Passkey.isSupported();
  } catch {
    return false;
  }
};

const ensureUsable = (options: WebAuthnOptions): void => {
  if (!passkeysSupported()) {
    throw new PasskeyCeremonyError('not_supported');
  }
  if (!isRelyingPartyAssociated(options)) {
    authLogger.warn({ message: 'Passkey relying party is not one of this app’s associated domains' });
    throw new PasskeyCeremonyError('not_supported');
  }
};

/** Runs the sign-in prompt for the server's request options and returns the assertion as WebAuthn JSON. */
export const getPasskeyAssertion = async (options: WebAuthnOptions): Promise<Record<string, unknown>> => {
  ensureUsable(options);
  try {
    const result = await Passkey.get(options as unknown as PasskeyGetRequest);
    return {
      id: result.id,
      rawId: result.rawId ?? result.id,
      type: result.type ?? 'public-key',
      authenticatorAttachment: result.authenticatorAttachment ?? null,
      response: {
        authenticatorData: result.response.authenticatorData,
        clientDataJSON: result.response.clientDataJSON,
        signature: result.response.signature,
        userHandle: result.response.userHandle ?? null,
      },
      clientExtensionResults: result.clientExtensionResults ?? {},
    };
  } catch (error) {
    throw new PasskeyCeremonyError(reasonFor(error));
  }
};

/** Runs the create prompt for the server's creation options and returns the attestation as WebAuthn JSON. */
export const createPasskeyCredential = async (options: WebAuthnOptions): Promise<Record<string, unknown>> => {
  ensureUsable(options);
  try {
    const result = await Passkey.create(options as unknown as PasskeyCreateRequest);
    return {
      id: result.id,
      rawId: result.rawId ?? result.id,
      type: result.type ?? 'public-key',
      authenticatorAttachment: result.authenticatorAttachment ?? null,
      response: {
        clientDataJSON: result.response.clientDataJSON,
        attestationObject: result.response.attestationObject,
        transports: result.response.transports ?? [],
      },
      clientExtensionResults: result.clientExtensionResults ?? {},
    };
  } catch (error) {
    throw new PasskeyCeremonyError(reasonFor(error));
  }
};
