import { registerSignOutHook } from '@resgrid/auth';
import { unregisterDispatcherDeskDeviceAtSignOut } from '@resgrid/data';

let registered: (() => void) | null = null;

/**
 * Takes this device's push token off the Dispatch-only desk subscriber at sign-out, as the session that ended (the
 * auth sign-out hook), so the next person on the device never gets the previous dispatcher's desk pushes. Inert where
 * the desk never registered the device (every app but Dispatch). Call once at start; returns the function that removes it.
 */
export function registerDispatcherDeskSignOut(): () => void {
  if (!registered) {
    const remove = registerSignOutHook(({ accessToken, baseUrl }) => unregisterDispatcherDeskDeviceAtSignOut({ accessToken, baseUrl }));

    registered = () => {
      remove();
      registered = null;
    };
  }

  return registered;
}
