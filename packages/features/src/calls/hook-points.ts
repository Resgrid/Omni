import type { UdfFieldResultData } from '@resgrid/models';
import type React from 'react';
import { useSyncExternalStore } from 'react';

import type { DispatchSelection } from './lib/call-form';

/**
 * Extension points of the call create/edit form that other modules fill in (omni-plan §7.10), so the form never forks
 * per app and never imports modules above it: the contacts feature supplies the contact picker, the runcards module
 * the run-card recommendation (shown only with `capabilities.calls.runCards`), the maps workstream the location
 * picker; the custom-field (UDF) definitions loader lives here until @resgrid/api carries `/UserDefinedFields/{type}`.
 */

export interface ContactPickerProps {
  isOpen: boolean;
  onClose: () => void;
  /** The picked contact: fills contact name/info and, when known, the address and coordinates. */
  onSelect: (contact: { contactId: string; name: string; info?: string; address?: string; latitude?: number; longitude?: number }) => void;
}

export interface RunCardRecommendationProps {
  /** Form state the recommendation is computed from. */
  call: { type: string; priority: number | null; latitude?: number; longitude?: number; address: string };
  selection: DispatchSelection;
  /** Apply the recommended dispatch (and the decision key the server records). */
  onApply: (selection: DispatchSelection, decision: { outcomeNodeKey?: string; unitResponseCodes?: string }) => void;
}

export interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  initial?: { latitude: number; longitude: number } | null;
  onSelect: (location: { latitude: number; longitude: number; address?: string }) => void;
}

export interface CallFormHookPoints {
  ContactPicker?: React.ComponentType<ContactPickerProps>;
  RunCardRecommendation?: React.ComponentType<RunCardRecommendationProps>;
  LocationPicker?: React.ComponentType<LocationPickerProps>;
  /** Loads the department's call custom fields (EntityType Call = 0). */
  loadUdfFields?: () => Promise<UdfFieldResultData[]>;
}

let hookPoints: CallFormHookPoints = {};
const listeners = new Set<() => void>();

/** Merges hook points (call at module init). Returns a function that removes exactly these entries again. */
export function registerCallFormHookPoints(points: CallFormHookPoints): () => void {
  hookPoints = { ...hookPoints, ...points };
  for (const listener of [...listeners]) listener();
  return () => {
    const next: CallFormHookPoints = { ...hookPoints };
    for (const key of Object.keys(points) as (keyof CallFormHookPoints)[]) if (next[key] === points[key]) delete next[key];
    hookPoints = next;
    for (const listener of [...listeners]) listener();
  };
}

export function getCallFormHookPoints(): CallFormHookPoints {
  return hookPoints;
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useCallFormHookPoints(): CallFormHookPoints {
  return useSyncExternalStore(subscribe, getCallFormHookPoints, getCallFormHookPoints);
}

/** Test helper. */
export function resetCallFormHookPointsForTests(): void {
  hookPoints = {};
  for (const listener of [...listeners]) listener();
}
