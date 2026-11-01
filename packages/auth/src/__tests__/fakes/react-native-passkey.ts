// react-native-passkey fake: tests choose what the next prompt does.
type Outcome = { ok: true; value: Record<string, unknown> } | { ok: false; error: { error: string } };

let next: Outcome = { ok: false, error: { error: 'UserCancelled' } };
let supported = true;
export const requests: unknown[] = [];

export function __setPasskeyOutcome(outcome: Outcome): void {
  next = outcome;
}

export function __setPasskeySupported(value: boolean): void {
  supported = value;
}

export const Passkey = {
  isSupported: (): boolean => supported,
  get: async (request: unknown): Promise<Record<string, unknown>> => {
    requests.push(request);
    if (!next.ok) throw next.error;
    return next.value;
  },
  create: async (request: unknown): Promise<Record<string, unknown>> => {
    requests.push(request);
    if (!next.ok) throw next.error;
    return next.value;
  },
};

export type PasskeyGetRequest = Record<string, unknown>;
export type PasskeyCreateRequest = Record<string, unknown>;
