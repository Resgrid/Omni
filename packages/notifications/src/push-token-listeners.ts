/**
 * The push token the server took for this device, for subscribers that follow the variant's own registration — the
 * Dispatch app puts the same token on its Dispatch-only desk subscriber (`DispatcherDesk/RegisterDevice`,
 * dispatchers-on-duty plan D6). The native and web push services report each accepted registration here; sign-out
 * forgets it. A listener added later hears the current token at once.
 */

/** Core push platform ids, as `Devices/RegisterDevice` takes them: 1 iOS, 2 Android, 3 web and Electron. */
export type PushPlatformId = 1 | 2 | 3;

export interface RegisteredPushToken {
  token: string;
  platform: PushPlatformId;
}

export type PushTokenListener = (registered: RegisteredPushToken) => void;

const listeners = new Set<PushTokenListener>();
let current: RegisteredPushToken | null = null;

const tell = (listener: PushTokenListener, registered: RegisteredPushToken): void => {
  try {
    listener(registered);
  } catch {
    // One listener's failure never stops the others or the registration.
  }
};

/** Listens for accepted registrations; hears the current one (if any) straight away. Returns the unsubscribe function. */
export const onPushTokenRegistered = (listener: PushTokenListener): (() => void) => {
  listeners.add(listener);

  if (current) tell(listener, current);

  return () => {
    listeners.delete(listener);
  };
};

/** Called by the push services once the server took this device's token. */
export const notifyPushTokenRegistered = (registered: RegisteredPushToken): void => {
  if (!registered.token) return;
  current = { token: registered.token, platform: registered.platform };

  for (const listener of [...listeners]) tell(listener, current);
};

/** The token the server last took this session, or null. */
export const getRegisteredPushToken = (): RegisteredPushToken | null => current;

/** Sign-out: the next session starts without a token until its own registration lands. */
export const clearRegisteredPushToken = (): void => {
  current = null;
};

/** Test hook. */
export const resetPushTokenListenersForTests = (): void => {
  listeners.clear();
  current = null;
};
