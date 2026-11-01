import { useEffect, useState } from 'react';

import { createRealtimeLifecycle, type RealtimeLifecycleOptions } from '../lifecycle';

export interface UseRealtimeLifecycleOptions extends RealtimeLifecycleOptions {
  isSignedIn: boolean;
  /** The department config (EventingUrl) and rights are loaded. */
  isReady: boolean;
}

/**
 * Mount once in the signed-in app shell: connects the hubs while signed in and in the foreground, closes them after the
 * native background grace, reconnects on resume, and runs the watchdog where the variant asks for it.
 */
export function useRealtimeLifecycle({ isSignedIn, isReady, ...options }: UseRealtimeLifecycleOptions): void {
  // Created once per mount; options are read at creation.
  const [controller] = useState(() => createRealtimeLifecycle(options));

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  useEffect(() => {
    controller.setSession({ isSignedIn, isReady });
  }, [controller, isSignedIn, isReady]);
}
