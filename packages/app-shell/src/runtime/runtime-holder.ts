import type { ApiContext } from '@resgrid/api';
import type { AuthRuntime } from '@resgrid/auth';
import type { OfflineRuntime } from '@resgrid/offline';

/** What startup opened: the composition root's handles, read by later steps and the session services. */
export interface ShellRuntime {
  offline: OfflineRuntime | null;
  auth: AuthRuntime | null;
}

let runtime: ShellRuntime = { offline: null, auth: null };

export const getShellRuntime = (): ShellRuntime => runtime;

export function setShellRuntime(patch: Partial<ShellRuntime>): void {
  runtime = { ...runtime, ...patch };
}

/** The authenticated API context; throws before the auth step ran (a step order bug, not a user error). */
export function requireApiContext(): ApiContext {
  const context = runtime.auth?.context;
  if (!context) {
    throw new Error('The API context is not available yet: the auth init step has not run.');
  }
  return context;
}

export function requireOfflineRuntime(): OfflineRuntime {
  if (!runtime.offline) {
    throw new Error('Offline storage is not open yet: the offline init step has not run.');
  }
  return runtime.offline;
}

/** Test helper. Not for app code. */
export function resetShellRuntimeForTests(): void {
  runtime = { offline: null, auth: null };
}
