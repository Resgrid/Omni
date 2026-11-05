import '../../settings/__tests__/test-setup';

import { MFA_ERROR_CODES, mfaErrorKey } from '@resgrid/auth';
import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

// The English common namespace, as shipped (the other nine languages are kept in key parity by the i18n tests).
const englishSchema = z.object({ mfa: z.object({ errors: z.record(z.string(), z.string()) }) });
const english = englishSchema.parse(JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', 'i18n', 'src', 'translations', 'common', 'en.json'), 'utf8')));

describe('MFA, passkey and SSO refusal messages', () => {
  it('has an English message for every code the app names, and for the fallback', () => {
    const missing = [...MFA_ERROR_CODES, 'unknown_error'].filter((code) => !Object.hasOwn(english.mfa.errors, code));
    expect(missing).toEqual([]);
  });

  it('resolves every code it accepts to a key that exists', () => {
    for (const code of [...MFA_ERROR_CODES, 'return_target_not_allowed', 'sso_transaction_expired', 'something_new']) {
      const key = mfaErrorKey(code).replace(/^mfa\.errors\./, '');
      expect(english.mfa.errors[key]).toEqual(expect.any(String));
    }
  });
});
