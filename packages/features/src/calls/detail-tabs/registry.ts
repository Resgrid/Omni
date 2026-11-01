import type { SecurityView } from '@resgrid/auth';
import type { Capabilities, VariantId } from '@resgrid/config';
import type { CallExtraDataResultData, CallResultData } from '@resgrid/models';
import type { FormFactor } from '@resgrid/ui';
import type React from 'react';
import { useSyncExternalStore } from 'react';

/**
 * Call detail tab registry (omni-plan §7.10). The detail screen renders whatever is registered and visible for the
 * call: the shared tabs register in `built-in-tabs.tsx`; incident command, records, Dispatch-only (alarm level,
 * escalate, response code, outstanding requirements), IC-only (unit readiness, command sheets) and Unit-only
 * (status for call) tabs are registered by their own modules — no per-app fork of the screen.
 */
export interface CallDetailTabContext {
  callId: string;
  call: CallResultData;
  extraData: CallExtraDataResultData | null;
  capabilities: Capabilities;
  variantId: VariantId;
  security: SecurityView;
  formFactor: FormFactor;
  /** Department feature flags (`useFeatureFlag`), read through the screen so registrations stay pure. */
  isFeatureEnabled: (flag: string) => boolean;
  /** Overdue/critical check-in timers on the call (badge for the check-in tab). */
  overdueCheckIns: number;
  /** Re-reads the call (after a write, a protected reveal, a realtime ping). */
  refresh: () => Promise<void>;
  /** Open the call's notes / images / files surfaces. */
  openNotes: () => void;
  openImages: () => void;
  openFiles: () => void;
}

export interface CallDetailTabDefinition {
  /** Unique; registering an id again replaces the earlier definition. */
  id: string;
  /** Lower first. Shared tabs use multiples of 10 so modules can slot in between. */
  order: number;
  /** Translation key (SharedTabs runs it through t()). */
  title: string;
  render: (context: CallDetailTabContext) => React.ReactNode;
  /** Default: always visible. */
  visible?: (context: CallDetailTabContext) => boolean;
  /** Tab badge (e.g. overdue check-ins). */
  badge?: (context: CallDetailTabContext) => number | undefined;
  badgeVariant?: 'critical' | 'warning';
}

const tabs = new Map<string, CallDetailTabDefinition>();
const listeners = new Set<() => void>();
let snapshot: readonly CallDetailTabDefinition[] = [];

const emit = (): void => {
  snapshot = [...tabs.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const listener of [...listeners]) listener();
};

/** Registers (or replaces) a tab. Returns the unregister function. */
export function registerCallDetailTab(definition: CallDetailTabDefinition): () => void {
  tabs.set(definition.id, definition);
  emit();
  return () => {
    if (tabs.get(definition.id) === definition) {
      tabs.delete(definition.id);
      emit();
    }
  };
}

export function unregisterCallDetailTab(id: string): void {
  if (tabs.delete(id)) emit();
}

/** Every registered tab in display order. */
export function getCallDetailTabs(): readonly CallDetailTabDefinition[] {
  return snapshot;
}

/** The tabs to show for a call; a `visible` that throws hides its tab instead of breaking the screen. */
export function resolveCallDetailTabs(context: CallDetailTabContext, definitions: readonly CallDetailTabDefinition[] = snapshot): CallDetailTabDefinition[] {
  return definitions.filter((definition) => {
    if (!definition.visible) return true;
    try {
      return definition.visible(context);
    } catch {
      return false;
    }
  });
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Registered tabs, re-rendering when a module registers or removes one. */
export function useRegisteredCallDetailTabs(): readonly CallDetailTabDefinition[] {
  return useSyncExternalStore(subscribe, getCallDetailTabs, getCallDetailTabs);
}

/** Test helper: removes every registration. */
export function resetCallDetailTabsForTests(): void {
  tabs.clear();
  emit();
}
