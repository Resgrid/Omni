import type React from 'react';
import { useSyncExternalStore } from 'react';

/**
 * Overrides for cards on the member home (omni-plan §7.10–7.11). By default the home shows the checklists module's
 * due-checks card ("Checklists (+ due-checks card)"); a variant or embedding screen can register a different one here,
 * and a screen prop wins over both.
 */
export interface MemberHomeHookPoints {
  /** Checklist runs due now or overdue for the member (rendered at the top of the home). */
  DueChecksCard?: React.ComponentType;
}

let hookPoints: MemberHomeHookPoints = {};
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of [...listeners]) listener();
};

/** Merges hook points (call at module init). Returns a function that removes exactly these entries again. */
export function registerMemberHomeHookPoints(points: MemberHomeHookPoints): () => void {
  hookPoints = { ...hookPoints, ...points };
  notify();
  return () => {
    const next: MemberHomeHookPoints = { ...hookPoints };
    for (const key of Object.keys(points) as (keyof MemberHomeHookPoints)[]) if (next[key] === points[key]) delete next[key];
    hookPoints = next;
    notify();
  };
}

export function getMemberHomeHookPoints(): MemberHomeHookPoints {
  return hookPoints;
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useMemberHomeHookPoints(): MemberHomeHookPoints {
  return useSyncExternalStore(subscribe, getMemberHomeHookPoints, getMemberHomeHookPoints);
}
