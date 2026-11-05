import { resetActiveVariantForTests } from '@resgrid/config';

import { createPasskeyCredential, getPasskeyAssertion } from '../passkeys/passkey';
import * as webPasskey from '../passkeys/passkey.web';
import { isPasskeyCeremonyError, type PasskeyCeremonyReason } from '../passkeys/passkey-errors';
import { __setPasskeyOutcome, __setPasskeySupported } from './fakes/react-native-passkey';
import { activateVariant } from './helpers/variant';

const assertionOptions = { challenge: 'Y2hhbGxlbmdl', rpId: 'unit.resgrid.com' };
const creationOptions = { challenge: 'Y2hhbGxlbmdl', rp: { id: 'unit.resgrid.com', name: 'Resgrid' }, user: { id: 'dXNlcg', name: 'member', displayName: 'Member' } };

const reasonOf = async (run: () => ReturnType<typeof getPasskeyAssertion>): Promise<PasskeyCeremonyReason | 'resolved' | 'other'> => {
  try {
    await run();

    return 'resolved';
  } catch (error) {
    return isPasskeyCeremonyError(error) ? error.reason : 'other';
  }
};

describe('passkey prompt outcomes on iOS and Android (react-native-passkey codes)', () => {
  beforeEach(() => {
    activateVariant('unit');
    __setPasskeySupported(true);
  });
  afterEach(() => resetActiveVariantForTests());

  it.each<[string, PasskeyCeremonyReason]>([
    ['UserCancelled', 'cancelled'],
    ['Interrupted', 'cancelled'],
    ['TimedOut', 'cancelled'],
    ['NotSupported', 'not_supported'],
    ['BadConfiguration', 'not_supported'],
    ['NoCreateOption', 'not_supported'],
    ['NoCredentials', 'no_credentials'],
    ['CredentialAlreadyExists', 'already_registered'],
    ['RequestFailed', 'failed'],
    ['Native error', 'failed'],
  ])('reads %s as %s', async (code, reason) => {
    __setPasskeyOutcome({ ok: false, error: { error: code } });
    await expect(reasonOf(() => getPasskeyAssertion(assertionOptions))).resolves.toBe(reason);
    await expect(reasonOf(() => createPasskeyCredential(creationOptions))).resolves.toBe(reason);
  });
});

describe('passkey prompt outcomes in the browser (DOMException names)', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let rejectWith: string;

  beforeEach(() => {
    activateVariant('unit');
    rejectWith = 'NotAllowedError';
    const refuse = () => Promise.reject(Object.assign(new Error('refused'), { name: rejectWith }));
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { isSecureContext: true, location: { protocol: 'https:', hostname: 'unit.resgrid.com' }, PublicKeyCredential: function PublicKeyCredential() {} },
    });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { credentials: { get: refuse, create: refuse } } });
  });

  afterEach(() => {
    for (const [name, original] of [
      ['window', originalWindow],
      ['navigator', originalNavigator],
    ] as const) {
      if (original) {
        Object.defineProperty(globalThis, name, original);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    }

    resetActiveVariantForTests();
  });

  it.each<[string, PasskeyCeremonyReason, PasskeyCeremonyReason]>([
    ['NotAllowedError', 'cancelled', 'cancelled'],
    ['AbortError', 'cancelled', 'cancelled'],
    ['SecurityError', 'not_supported', 'not_supported'],
    // Only a registration can collide with a passkey the authenticator already holds for this account.
    ['InvalidStateError', 'failed', 'already_registered'],
    ['UnknownError', 'failed', 'failed'],
  ])('reads %s as %s (sign-in) and %s (registration)', async (name, signIn, registration) => {
    rejectWith = name;
    await expect(reasonOf(() => webPasskey.getPasskeyAssertion(assertionOptions))).resolves.toBe(signIn);
    await expect(reasonOf(() => webPasskey.createPasskeyCredential(creationOptions))).resolves.toBe(registration);
  });

  it('offers no passkey on a page that is not a secure https or localhost origin (the desktop app:// shell)', () => {
    expect(webPasskey.passkeysSupported()).toBe(true);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true, location: { protocol: 'app:', hostname: 'bundle' }, PublicKeyCredential: function PublicKeyCredential() {} } });
    expect(webPasskey.passkeysSupported()).toBe(false);
  });
});
