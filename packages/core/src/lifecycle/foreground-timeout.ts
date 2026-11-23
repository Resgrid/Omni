import { AppState, Platform } from 'react-native';

export const FOREGROUND_TIMED_OUT: unique symbol = Symbol('foreground-timed-out');

/**
 * Web, while the member may be answering the browser's prompt for the permission a wait names (it is never shorter than
 * the wait's own limit). A limit, not a pause as on native: the page stays on screen, Firefox reports every permission it
 * has not stored as `prompt` (a one-time grant included), and a browser may leave a request pending with no prompt shown.
 */
export const BROWSER_PROMPT_TIMEOUT_MS = 60_000;

interface Subscription {
  remove: () => void;
}

/** The OS prompt puts the app in `inactive` (iOS) or `background` (Android); a system Settings page in `background`. */
const isBehindTheSystem = (state: string | null | undefined): boolean => state === 'background' || state === 'inactive';

/** What a web wait reads from the browser; any part may be missing (an older browser, a test). */
interface BrowserGlobals {
  navigator?: { permissions?: Permissions };
  window?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  document?: { hasFocus?: () => boolean };
}

const browser: BrowserGlobals = globalThis;

/**
 * Web: calls `onChange(answering)` now and whenever it changes. The member may be answering while the browser reports
 * `name` undecided (`prompt`, or no answer: an older browser, or a name it does not know) or while the page has lost focus
 * (macOS's own microphone dialog over the Electron window). Decided and in focus, nothing is waiting on the member.
 */
const watchBrowserPrompt = (name: PermissionName, onChange: (answering: boolean) => void): Subscription => {
  let status: PermissionStatus | null = null;
  let focused = browser.document?.hasFocus?.() ?? true;
  let answering: boolean | null = null;
  let released = false;
  const page = browser.window;

  const update = (): void => {
    const next = status === null || status.state === 'prompt' || !focused;

    if (released || next === answering) return;
    answering = next;
    onChange(next);
  };

  const onFocus = (): void => {
    focused = true;
    update();
  };

  const onBlur = (): void => {
    focused = false;
    update();
  };

  page?.addEventListener('focus', onFocus);
  page?.addEventListener('blur', onBlur);
  update();

  const permissions = browser.navigator?.permissions;

  if (permissions) {
    void Promise.resolve()
      .then(() => permissions.query({ name }))
      .then((result) => {
        if (released) return;
        // Subscribe before keeping it: a status that cannot be watched stays unknown.
        result.addEventListener('change', update);
        status = result;
        update();
      })
      .catch(() => undefined);
  }

  return {
    remove: () => {
      released = true;
      status?.removeEventListener('change', update);
      page?.removeEventListener('focus', onFocus);
      page?.removeEventListener('blur', onBlur);
    },
  };
};

/**
 * Resolves with the promise's value, or `FOREGROUND_TIMED_OUT` once it has stayed unsettled for `ms` with the app in
 * front. For waits that include the user answering the OS: a permission dialog, or Android 11+ sending "Allow all the
 * time" to the app's Settings page. Time spent there never counts, and each return to the app restarts the full window,
 * so a slow answer is not mistaken for a request that hung. The listener and timer are released either way.
 *
 * Web keeps a plain timer (core pins web to active, `app-lifecycle`), since a browser prompt leaves the page in front.
 * A wait that asks for a browser permission names it in `browserPermission`: while the member may be answering
 * (`watchBrowserPrompt`) the limit is `BROWSER_PROMPT_TIMEOUT_MS`, and each change restarts the full window. Native
 * ignores it.
 */
export function settleWithinForeground<T>(promise: Promise<T>, ms: number, browserPermission?: PermissionName): Promise<T | typeof FOREGROUND_TIMED_OUT> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let subscription: Subscription | null = null;

    const stopTimer = (): void => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const release = (): void => {
      stopTimer();
      subscription?.remove();
      subscription = null;
    };

    const startTimer = (windowMs: number = ms): void => {
      if (timer) return;
      timer = setTimeout(() => {
        release();
        resolve(FOREGROUND_TIMED_OUT);
      }, windowMs);
    };

    if (Platform.OS === 'web' && browserPermission) {
      subscription = watchBrowserPrompt(browserPermission, (answering) => {
        stopTimer();
        startTimer(answering ? Math.max(ms, BROWSER_PROMPT_TIMEOUT_MS) : ms);
      });
    } else if (Platform.OS === 'web') {
      startTimer();
    } else {
      subscription = AppState.addEventListener('change', (next: string) => (isBehindTheSystem(next) ? stopTimer() : startTimer()));

      if (!isBehindTheSystem(AppState.currentState)) startTimer();
    }

    promise.finally(release).then(resolve, reject);
  });
}
