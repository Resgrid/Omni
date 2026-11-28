import { isElectron } from '@resgrid/core/platform/platform';

import type { LaunchBrowser } from './launch-browser';

export type { LaunchBrowser, LaunchBrowserResult } from './launch-browser';

const LAUNCH_WINDOW_NAME = 'resgrid-lms-lesson';

/**
 * Web and Electron: a top-level window, where an LTI tool may use its own cookies and sign-in. In Electron `window.open` reaches the
 * system browser (the shell's window-open handler). A browser blocks a window opened after the launch request returns, so the
 * window opens blank now, while the tap still counts, and is pointed at the link (cut off from this app first) once it arrives.
 * With no window to point (the browser blocked it, or the member closed it), `open` says `blocked` instead of opening one late: a
 * window opened then would be blocked too, and the member starts again with a new tap.
 */
export function prepareLaunchBrowser(): LaunchBrowser {
  if (isElectron()) {
    return {
      open: async (url) => {
        window.open(url, '_blank', 'noopener,noreferrer');

        return 'opened';
      },
      discard: () => undefined,
    };
  }

  const popup = window.open('', LAUNCH_WINDOW_NAME);

  return {
    open: async (url) => {
      if (!popup || popup.closed) return 'blocked';

      popup.opener = null;
      popup.location.href = url;

      return 'opened';
    },
    discard: () => popup?.close(),
  };
}

/** A window the lesson opens: a new browser window (the system browser in Electron), cut off from this app. */
export function openInSystemBrowser(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
