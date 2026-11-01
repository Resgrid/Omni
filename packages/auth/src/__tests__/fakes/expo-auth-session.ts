// expo-auth-session fake: just enough for the OIDC helpers (redirect URI and the IdP code exchange).
export const ResponseType = { Code: 'code' } as const;
export const Prompt = { Login: 'login' } as const;

export const exchanges: unknown[] = [];
let nextIdToken: string | null = 'idp-id-token';

export function __setNextIdToken(token: string | null): void {
  nextIdToken = token;
}

export function makeRedirectUri(options: { scheme?: string; path?: string } = {}): string {
  return options.scheme ? `${options.scheme}://${options.path ?? ''}` : `https://app.example.com/${options.path ?? ''}`;
}

export async function exchangeCodeAsync(config: unknown): Promise<{ idToken: string | null }> {
  exchanges.push(config);
  return { idToken: nextIdToken };
}

export function useAutoDiscovery(): null {
  return null;
}

export function useAuthRequest(): [null, null, () => Promise<{ type: string }>] {
  return [null, null, async () => ({ type: 'cancel' })];
}
