import type { CallResultData, UdfFieldResultData } from '@resgrid/models';
import type React from 'react';
import { useSyncExternalStore } from 'react';

import type { DispatchSelection } from './lib/call-form';

/**
 * Extension points of the call form and call detail that other modules fill in (omni-plan §7.10), so the screens never
 * fork per app and never import modules above them (the calls cluster never imports @resgrid/maps or native audio):
 * the runcards module supplies the run-card recommendations (shown only with `capabilities.calls.runCards`) for a new
 * call and for "Dispatch more"; the app layer supplies the maps (location picker, static map) and clip playback. The
 * contact picker and custom-field (UDF) loader are built in (Dispatch baseline); a registration here replaces them.
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

export interface AddResourcesRecommendationProps {
  /** The call already out that resources are being added to. */
  callId: string;
  /** What the dispatcher has picked to add so far. */
  selection: DispatchSelection;
  /** Apply the recommendation (only what the call still lacks) and the per-unit response codes to post with it. */
  onApply: (selection: DispatchSelection, decision: { unitResponseCodes?: string }) => void;
}

export interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  initial?: { latitude: number; longitude: number } | null;
  onSelect: (location: { latitude: number; longitude: number; address?: string }) => void;
}

export interface StaticLocationMapProps {
  latitude: number;
  longitude: number;
  /** Shown in the map's overlay and accessibility label; never a withheld (protected) value. */
  address?: string;
  height: number;
  onPress?: () => void;
  testID?: string;
}

export interface CallDetailActionProps {
  /** The server call the detail screen shows (never a call queued on this device). */
  call: CallResultData;
}

/** A recorded clip that is playing. */
export interface AudioClipHandle {
  stop: () => void;
}

export interface CallFormHookPoints {
  ContactPicker?: React.ComponentType<ContactPickerProps>;
  RunCardRecommendation?: React.ComponentType<RunCardRecommendationProps>;
  /** Run cards in "Dispatch more" on a call already out (shown with `capabilities.calls.runCards`). */
  AddResourcesRecommendation?: React.ComponentType<AddResourcesRecommendationProps>;
  /** Full-screen map picker for the call location (form). */
  LocationPicker?: React.ComponentType<LocationPickerProps>;
  /** Small map of a point (detail: the call or its destination; form: the picked location). */
  StaticLocationMap?: React.ComponentType<StaticLocationMapProps>;
  /**
   * An action beside the call's title on the detail screen, supplied by a module the calls screens may not import (Unit:
   * "Set Active", from unit-status). It gates itself on capabilities and renders nothing where it does not apply.
   */
  CallDetailAction?: React.ComponentType<CallDetailActionProps>;
  /** Plays a call audio recording in the app; without it the recording opens in the platform player. */
  playAudioClip?: (url: string, onFinished: () => void) => Promise<AudioClipHandle>;
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
