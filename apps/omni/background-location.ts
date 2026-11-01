// The headless background-location bootstrap, registered by the app entry (index.ts) before expo-router mounts anything
// (omni-plan §7.7). When the OS relaunches a killed app only to deliver a location batch, no route renders: the variant
// root layout never runs, so nothing has set the variant, opened storage, restored the session or configured the
// transmitter. The bootstrap does that on demand — it evaluates the variant's root layout module through expo-router's
// own route context (the bundle holds only this variant's tree), which calls setActiveVariant and configureAppShell,
// then runs the shell's startup phase — and @resgrid/location hands it the batch.
import type * as AppShell from '@resgrid/app-shell';
import { type EntryLocationConfig, getEntryLocationConfig, registerBackgroundLocationBootstrap } from '@resgrid/location/background-task';
import { ctx } from 'expo-router/_ctx';
import { Platform } from 'react-native';

const ROOT_LAYOUT_KEY = /^\.\/_layout\.[jt]sx?$/;

type RouteContext = Pick<typeof ctx, 'keys'> & ((key: string) => unknown);

/** Evaluates (without rendering) the variant root layout module from an expo-router route context. */
export async function loadVariantRootLayout(context: RouteContext = ctx): Promise<void> {
  const key = context.keys().find((candidate) => ROOT_LAYOUT_KEY.test(candidate));
  if (!key) {
    throw new Error('The expo-router route context has no root _layout.');
  }
  // Native imports routes synchronously; a lazy context returns a promise.
  await context(key);
}

export interface EntryBackgroundLocationDeps {
  platform: string;
  /** What `@resgrid/location/background-task` read from the build's Expo config (`extra.location.background`). */
  entryConfig: EntryLocationConfig | null;
  register: (bootstrap: (() => Promise<void>) | null) => void;
  loadRootLayout: () => Promise<void>;
  /** The shell's startup phase (`runBackgroundStartup`); loaded lazily so the entry stays light. */
  runStartup: () => Promise<void>;
}

const defaultDeps = (): EntryBackgroundLocationDeps => ({
  platform: Platform.OS,
  entryConfig: getEntryLocationConfig(),
  register: registerBackgroundLocationBootstrap,
  loadRootLayout: () => loadVariantRootLayout(),
  runStartup: () => {
    // After loadRootLayout the shell module is already evaluated; requiring it here keeps it out of the entry's own
    // module graph (it must not load before expo-router's entry in a normal launch).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shell = require('@resgrid/app-shell') as typeof AppShell;
    return shell.runBackgroundStartup();
  },
});

/**
 * Registers the bootstrap where the build has background location on iOS/Android (variants whose app config sets
 * `extra.location.background`). Returns whether it registered one.
 */
export function registerEntryBackgroundLocation(deps: EntryBackgroundLocationDeps = defaultDeps()): boolean {
  if ((deps.platform !== 'ios' && deps.platform !== 'android') || deps.entryConfig?.background !== true) {
    return false;
  }
  deps.register(async () => {
    await deps.loadRootLayout();
    await deps.runStartup();
  });
  return true;
}
