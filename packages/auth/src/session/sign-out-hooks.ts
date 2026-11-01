/**
 * Work that has to reach the server as the ended session, after the store has dropped its credentials (Dispatch's
 * clear-state-first order): taking this device's push token off the server so the next person never sees the previous
 * one's calls (`@resgrid/notifications` registers that hook), unregistering the web push subscription, …
 *
 * A hook gets the token and the server it was issued by as they stood, and must call that server directly — never
 * through the API client, which has already stopped acting for the session. A server switch signs out first and only
 * then changes the URL, so the push unregister always reaches the old server.
 */
export interface SignOutHookContext {
  /** The ended session's access token (the server still honours it after this device lets it go). */
  accessToken: string | null;
  /** The API base (`…/api/v4`) the session belonged to. */
  baseUrl: string;
}

export type SignOutHook = (context: SignOutHookContext) => Promise<void>;

/** Sign-out never waits longer than this on a slow or unreachable server. */
export const SIGN_OUT_HOOK_TIMEOUT_MS = 3000;

const hooks = new Set<SignOutHook>();

/** Returns a function that removes the hook. */
export const registerSignOutHook = (hook: SignOutHook): (() => void) => {
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
};

export const runSignOutHooks = async (context: SignOutHookContext): Promise<void> => {
  if (hooks.size === 0) {
    return;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SIGN_OUT_HOOK_TIMEOUT_MS);
  });

  try {
    await Promise.race([Promise.allSettled([...hooks].map((hook) => Promise.resolve().then(() => hook(context)))), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

/** Test hook. */
export const clearSignOutHooksForTests = (): void => {
  hooks.clear();
};
