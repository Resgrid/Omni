/**
 * Why a passkey prompt did not produce a credential. Cancelling (or letting the prompt time out) is the member's choice,
 * never a failed verification; `already_registered` is a registration for an account this device already has a passkey for.
 */
export type PasskeyCeremonyReason = 'cancelled' | 'not_supported' | 'no_credentials' | 'already_registered' | 'failed';

export class PasskeyCeremonyError extends Error {
  readonly reason: PasskeyCeremonyReason;

  constructor(reason: PasskeyCeremonyReason) {
    super(`passkey_${reason}`);
    this.name = 'PasskeyCeremonyError';
    this.reason = reason;
  }
}

export const isPasskeyCeremonyError = (error: unknown): error is PasskeyCeremonyError => error instanceof PasskeyCeremonyError;
