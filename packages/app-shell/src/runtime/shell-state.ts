import type { GetConfigResultData } from '@resgrid/models';
import type { ModeType } from '@resgrid/ui';
import { create } from 'zustand';

/**
 * The shell's own state. Device preferences are read from the frozen legacy keys at startup (`SELECTED_THEME`,
 * `IS_FIRST_TIME`); the rest is session state the gate, header and providers render from.
 */
export interface ShellState {
  /** GluestackUIProvider mode; `system` until storage is open. */
  themeMode: ModeType;
  /** Null until storage is open (the gate is still loading then). */
  onboardingRequired: boolean | null;
  /** The app-access check signed the member out; the gate shows the denial until it is dismissed. */
  accessDeniedNotice: boolean;
  /** No connection (NetInfo / navigator.onLine). */
  isOffline: boolean;
  /** Outbox items not yet delivered for this session ("N changes waiting"). */
  unsentChanges: number;
  /**
   * `Config/GetConfig` for the signed-in department (EventingUrl, Novu, web push, location thresholds). Interim home:
   * the shared config store belongs in @resgrid/data (persisted `core-storage`).
   */
  departmentConfig: GetConfigResultData | null;
  /** The session bootstrap reached its push step: the registration hook may register this device. */
  pushRegistrationArmed: boolean;
}

const INITIAL: ShellState = {
  themeMode: 'system',
  onboardingRequired: null,
  accessDeniedNotice: false,
  isOffline: false,
  unsentChanges: 0,
  departmentConfig: null,
  pushRegistrationArmed: false,
};

export const useShellStore = create<ShellState>()(() => ({ ...INITIAL }));

export const getShellState = (): ShellState => useShellStore.getState();

export const setShellState = (patch: Partial<ShellState>): void => useShellStore.setState(patch);

/** Session-scoped fields go back to their defaults on sign-out (device preferences stay). */
export function resetShellSessionState(): void {
  useShellStore.setState({ departmentConfig: null, pushRegistrationArmed: false });
}

/** Test helper. Not for app code. */
export function resetShellStateForTests(): void {
  useShellStore.setState({ ...INITIAL });
}
