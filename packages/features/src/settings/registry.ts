import type { Capabilities, VariantManifest } from '@resgrid/config';
import type React from 'react';

/** What a section's `visible` and `render` see: the variant (capabilities, modules, shell) and the session. */
export interface SettingsSectionContext {
  manifest: VariantManifest;
  capabilities: Capabilities;
  isAuthenticated: boolean;
  platform: string;
}

/**
 * One block of the Settings screen (omni-plan §7.10 section registry). Shared sections are built in; a feature or variant
 * adds its own (Dispatch weather sources, BigBoard widgets…) with `registerSettingsSection`, and may replace a built-in one
 * by registering the same id. Visibility is decided from capabilities, never from the variant id.
 */
export interface SettingsSection {
  id: string;
  /** Ascending; built-ins use 10, 20, … 100 so a section can slot between them. */
  order: number;
  /** Translation key of the section heading. */
  title: string;
  render: (context: SettingsSectionContext) => React.ReactNode;
  visible?: (context: SettingsSectionContext) => boolean;
}

const sections = new Map<string, SettingsSection>();
const listeners = new Set<() => void>();
let builtInsLoader: (() => readonly SettingsSection[]) | null = null;
let builtInsLoaded = false;

const notify = (): void => listeners.forEach((listener) => listener());

const ensureBuiltIns = (): void => {
  if (builtInsLoaded || !builtInsLoader) {
    return;
  }
  builtInsLoaded = true;
  for (const section of builtInsLoader()) {
    if (!sections.has(section.id)) {
      sections.set(section.id, section);
    }
  }
};

/** Registers (or replaces, by id) a section. Returns the unregister function. */
export function registerSettingsSection(section: SettingsSection): () => void {
  ensureBuiltIns();
  sections.set(section.id, section);
  notify();
  return () => {
    if (sections.get(section.id) === section) {
      sections.delete(section.id);
      notify();
    }
  };
}

/** The sections this variant and session show, in order. */
export function getSettingsSections(context: SettingsSectionContext): SettingsSection[] {
  ensureBuiltIns();
  return [...sections.values()].filter((section) => (section.visible ? section.visible(context) : true)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function subscribeSettingsSections(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Internal: the Settings screen supplies the built-in sections lazily (keeps this module free of UI imports). */
export function setBuiltInSettingsSections(loader: () => readonly SettingsSection[]): void {
  builtInsLoader = loader;
}

/** Test helper: back to the built-ins only. */
export function resetSettingsSectionsForTests(): void {
  sections.clear();
  builtInsLoaded = false;
  notify();
}
