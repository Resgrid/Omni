import type { ApiContext } from '@resgrid/api';

/**
 * The authenticated API context this package's stores call through. Set once by `initAuth()` (or `setAuthApiContext()`
 * in tests); a late-bound reference so the stores can exist at module load before the shell has built the client.
 */
let context: ApiContext | null = null;

export function setAuthApiContext(next: ApiContext | null): void {
  context = next;
}

export function getAuthApiContext(): ApiContext {
  if (!context) {
    throw new Error('@resgrid/auth: no API context. Call initAuth() (or setAuthApiContext() in tests) before signing in.');
  }
  return context;
}

export const hasAuthApiContext = (): boolean => context !== null;
