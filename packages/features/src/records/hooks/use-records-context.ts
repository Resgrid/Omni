import { useCapability } from '@resgrid/config';
import { useStatusContext } from '@resgrid/features/status';
import type { FieldRecordContextInput } from '@resgrid/models';
import { useMemo, useSyncExternalStore } from 'react';

/**
 * The field context records are authored in (RMS plan RMS-1D). Each legacy app computed it from its own store
 * (Responder: active call; Unit: active unit + active call; Dispatch: the open call; IC: the command board's call and
 * the member's command role). The default reads the shell's status context (active call, and the active unit where
 * the variant's status subject is the unit); a module with a better answer — incident command's call and role —
 * registers its own hook. The server re-verifies the context on every request, so a stale value can only narrow the
 * catalog, never widen it.
 */
export type RecordsContextHook = () => FieldRecordContextInput;

let registered: RecordsContextHook | null = null;
const listeners = new Set<() => void>();

/** Replaces the default context hook (call at module init). Returns the unregister function. */
export function registerRecordsContextHook(hook: RecordsContextHook): () => void {
  registered = hook;
  for (const listener of [...listeners]) listener();
  return () => {
    if (registered === hook) {
      registered = null;
      for (const listener of [...listeners]) listener();
    }
  };
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getRegistered = (): RecordsContextHook | null => registered;

const positiveInt = (value: string | null | undefined): number | null => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Default: the active call, plus the active unit on a unit-subject device. */
export function useDefaultRecordsContext(): FieldRecordContextInput {
  const { activeCallId, activeUnitId } = useStatusContext();
  const status = useCapability('status');
  return useMemo(() => {
    const context: FieldRecordContextInput = {};
    const unitId = status.subject === 'unit' ? positiveInt(activeUnitId) : null;
    if (unitId) context.UnitId = unitId;
    const callId = positiveInt(activeCallId);
    if (callId) context.CallId = callId;
    return context;
  }, [activeCallId, activeUnitId, status.subject]);
}

/**
 * The current records context. Register the override at module init (before any records screen mounts): the
 * registered hook then runs on every render of every consumer, so the hook order never changes under a mounted screen.
 */
export function useRecordsContext(): FieldRecordContextInput {
  const fallback = useDefaultRecordsContext();
  const hook = useSyncExternalStore(subscribe, getRegistered, getRegistered);
  const override = hook ? hook() : null;
  return override ?? fallback;
}

/** Test helper. */
export function resetRecordsContextHookForTests(): void {
  registered = null;
  for (const listener of [...listeners]) listener();
}
