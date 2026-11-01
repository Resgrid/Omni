import { useChecklistsStore } from '@resgrid/data';
import type { ChecklistInput, ChecklistRun } from '@resgrid/models';
import { useSyncExternalStore } from 'react';

/**
 * The run sheet saves through whatever writer is registered here; without one, Save and Submit stay disabled with a
 * notice. The app registers `createDataChecklistRunWriter()` (outbox-backed `useChecklistsStore.saveRun`, Responder/Unit
 * offline scope, plan §8.5) from its shell registrations; tests register fakes.
 */
export interface ChecklistRunSaveRequest {
  run: ChecklistRun;
  input: ChecklistInput;
  /** Complete (submit) rather than save progress. */
  submit: boolean;
}

export interface ChecklistRunSaveResult {
  /** `sent`: accepted now; `queued`: held on the device to replay once; `rejected`: refused (validation, conflict, access). */
  outcome: 'sent' | 'queued' | 'rejected';
  /** The run as the server now holds it, when it answered. */
  run?: ChecklistRun | null;
}

export interface ChecklistRunWriter {
  save: (request: ChecklistRunSaveRequest) => Promise<ChecklistRunSaveResult>;
}

/** The production writer: SaveChecklistRunProgress / CompleteChecklistRun through the encrypted outbox. */
export function createDataChecklistRunWriter(): ChecklistRunWriter {
  return { save: ({ run, input, submit }) => useChecklistsStore.getState().saveRun(run, input, submit) };
}

let writer: ChecklistRunWriter | null = null;
const listeners = new Set<() => void>();

export function registerChecklistRunWriter(next: ChecklistRunWriter): () => void {
  writer = next;
  for (const listener of [...listeners]) listener();
  return () => {
    if (writer === next) {
      writer = null;
      for (const listener of [...listeners]) listener();
    }
  };
}

export const getChecklistRunWriter = (): ChecklistRunWriter | null => writer;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useChecklistRunWriter(): ChecklistRunWriter | null {
  return useSyncExternalStore(subscribe, getChecklistRunWriter, getChecklistRunWriter);
}

/** Test helper. */
export function resetChecklistRunWriterForTests(): void {
  writer = null;
  for (const listener of [...listeners]) listener();
}
