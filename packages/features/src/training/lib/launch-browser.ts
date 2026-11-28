import { logger } from '@resgrid/core/logging/logger';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { originOf } from './lesson-launch';

/**
 * How a launch opened outside the app's own player: back in the app (`closed`), still open elsewhere (`opened`), no window to open
 * it in (`blocked`: the browser refused the window or the member closed it; a new tap can try again), or not at all (`failed`).
 */
export type LaunchBrowserResult = 'closed' | 'opened' | 'blocked' | 'failed';

export interface LaunchBrowser {
  /** Opens the launch link outside the app's player. */
  open: (url: string) => Promise<LaunchBrowserResult>;
  /** Gives up what was prepared for a launch that did not come (the web's blank window). */
  discard: () => void;
}

/**
 * iOS and Android: the system browser's auth session (ASWebAuthenticationSession / Custom Tabs), for LTI tools that refuse to be
 * framed or to sign in inside an embedded browser (Google among them). The tool's return page does not come back to the app, so
 * the session ends when the member closes it; the player then reads the course again.
 */
export function prepareLaunchBrowser(): LaunchBrowser {
  return {
    open: async (url) => {
      try {
        await WebBrowser.openAuthSessionAsync(url, Linking.createURL('training/lms-return'), { preferEphemeralSession: false });

        return 'closed';
      } catch {
        return 'failed';
      }
    },
    discard: () => undefined,
  };
}

/** A window the lesson opens (a SCORM popup, a tool's help page): the system browser, never another in-app view. */
export function openInSystemBrowser(url: string): void {
  void WebBrowser.openBrowserAsync(url).catch(() => {
    // The origin only: a lesson's links can carry tokens in the path or query.
    logger.warn({ message: 'Could not open a lesson window in the system browser', context: { origin: originOf(url) ?? 'unknown' } });
  });
}
