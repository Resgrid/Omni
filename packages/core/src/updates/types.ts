/**
 * The slice of `expo-updates` the app-updates service uses (omni-plan D18). Only `apps/omni` depends on expo-updates: it
 * passes the real module on iOS/Android (`import * as Updates from 'expo-updates'` satisfies this type) and nothing on
 * web/Electron, so core never imports the native module and the web bundle never contains it.
 */
export interface UpdatesModule {
  /** False in development builds, Expo Go and builds without an update URL; the service is then a no-op. */
  readonly isEnabled: boolean;
  readonly updateId: string | null;
  readonly channel: string | null;
  readonly runtimeVersion: string | null;
  readonly createdAt: Date | null;
  readonly isEmbeddedLaunch: boolean;
  readonly isEmergencyLaunch: boolean;
  readonly emergencyLaunchReason: string | null;
  checkForUpdateAsync(): Promise<UpdatesCheckResult>;
  fetchUpdateAsync(): Promise<UpdatesFetchResult>;
  reloadAsync(): Promise<void>;
}

export interface UpdatesManifestLike {
  id?: string;
}

export interface UpdatesCheckResult {
  isAvailable: boolean;
  /** The server told this build to go back to its embedded update. */
  isRollBackToEmbedded: boolean;
  manifest?: UpdatesManifestLike;
}

export interface UpdatesFetchResult {
  isNew: boolean;
  isRollBackToEmbedded: boolean;
  manifest?: UpdatesManifestLike;
}

/** idle → checking → (downloading →) ready | idle | error. `ready` sticks until the app restarts. */
export type AppUpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';

/** Why a check ran (logged, never shown). */
export type AppUpdateCheckTrigger = 'bootstrap' | 'foreground' | 'manual';

/** Who asked for the restart: the member (toast, Settings) or the wall-display rule. */
export type AppUpdateApplyTrigger = 'user' | 'auto';

/**
 * - `restarting`: `reloadAsync` was called; the app is about to reload.
 * - `nothing-pending`: no downloaded update to apply.
 * - `blocked`: a restart guard said no (a voice session is connected).
 * - `disabled`: updates are off on this build or platform.
 * - `failed`: the reload was refused; the update still applies on the next cold start.
 */
export type AppUpdateApplyResult = 'restarting' | 'nothing-pending' | 'blocked' | 'disabled' | 'failed';

/** The update this launch runs. */
export interface CurrentAppUpdate {
  updateId: string | null;
  channel: string | null;
  runtimeVersion: string | null;
  createdAt: Date | null;
  /** The update built into the binary, not one downloaded since. */
  isEmbeddedLaunch: boolean;
  /** expo-updates fell back to the embedded update because a downloaded one failed to launch. */
  isEmergencyLaunch: boolean;
  emergencyLaunchReason: string | null;
}

/** A downloaded update waiting for a restart. */
export interface PendingAppUpdate {
  /** Null for a roll-back to the embedded update. */
  updateId: string | null;
  isRollBackToEmbedded: boolean;
  /** Epoch ms. */
  downloadedAt: number;
}

export interface AppUpdatesState {
  /** Updates work on this build (iOS/Android release builds with expo-updates enabled). */
  enabled: boolean;
  status: AppUpdateStatus;
  /** When the last check started (epoch ms), or null. */
  lastCheckAt: number | null;
  current: CurrentAppUpdate | null;
  pending: PendingAppUpdate | null;
  /** Code or name of the last failed check (never its message). */
  errorCode: string | null;
}

/** Returns a short reason (e.g. `'voice'`) while a restart must wait, or null when restarting is fine. */
export type AppUpdateRestartGuard = () => string | null;
