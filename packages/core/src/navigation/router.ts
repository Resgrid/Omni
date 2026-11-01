import { type Href, router } from 'expo-router';

/** Default retry budget: 40 × 250 ms = 10 s, enough for a cold start to mount the root layout and hydrate. */
export const DEFAULT_ROUTER_PUSH_MAX_ATTEMPTS = 40;
export const DEFAULT_ROUTER_PUSH_RETRY_DELAY_MS = 250;

export interface RouterPushRetryOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  /**
   * Extra gate the push waits on, beyond the router itself being mounted. Deep links use it to hold until the
   * session has hydrated — pushing a protected route before then just gets the app redirected straight back out
   * by the auth guard.
   */
  waitUntil?: () => boolean;
  /** `replace` instead of `push` (e.g. after sign-in, so Android back does not return to the login screen). */
  replace?: boolean;
}

let navigationReadyCheck: (() => boolean) | null = null;

/**
 * Publishes the navigation container's real readiness; the root layout registers it
 * (`registerNavigationReadyCheck(() => ref.isReady())`).
 *
 * `router.push` does NOT throw when the root layout has not mounted yet: expo-router logs a warning and drops the
 * navigation. Retrying inside a `catch` therefore waited on an error that never arrived, which is why a push
 * notification tap that cold-started the app silently landed on the home screen (IC's fix).
 *
 * Defaults to ready when nothing has registered, so callers outside the app tree (and tests) behave as before.
 */
export const registerNavigationReadyCheck = (check: (() => boolean) | null): void => {
  navigationReadyCheck = check;
};

export const isNavigationReady = (): boolean => navigationReadyCheck?.() ?? true;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pushes an expo-router href once the router (and any caller-supplied gate) is ready, retrying every
 * `retryDelayMs` up to `maxAttempts` times. Throws once the budget is exhausted.
 */
export const routerPushWithRetry = async (href: Href, options: RouterPushRetryOptions = {}): Promise<void> => {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_ROUTER_PUSH_MAX_ATTEMPTS);
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_ROUTER_PUSH_RETRY_DELAY_MS;
  const { waitUntil } = options;

  let lastError: unknown;

  for (let attempt = 1; ; attempt++) {
    // Only navigate once the router can receive it — an early push is discarded without an error. A gate that
    // throws counts as not-ready rather than aborting, so the budget surfaces one clear error instead of the
    // navigation vanishing without explanation.
    let ready: boolean;
    try {
      ready = isNavigationReady() && (waitUntil?.() ?? true);
    } catch (error) {
      lastError = error;
      ready = false;
    }

    if (ready) {
      try {
        if (options.replace) router.replace(href);
        else router.push(href);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (attempt >= maxAttempts) {
      throw lastError ?? new Error('Navigation never became ready; the push was dropped.');
    }

    await sleep(retryDelayMs);
  }
};
