import type { Capabilities, FeatureModuleId } from '@resgrid/config';

import { flagsOf, type NavEntry, type NavPlacement, navRouteName } from './define-nav';

export interface NavFilterContext {
  /** Department feature flag lookup (unknown flags must read as disabled). */
  isFlagEnabled: (key: string) => boolean;
  capabilities: Capabilities;
  hasModule: (moduleId: FeatureModuleId) => boolean;
}

/** Whether an entry is available to this variant, department and session (placement aside). */
export function isNavEntryAvailable(entry: NavEntry, context: NavFilterContext): boolean {
  if (entry.requiresModule && !context.hasModule(entry.requiresModule)) {
    return false;
  }
  if (entry.requiresCapability) {
    try {
      if (!entry.requiresCapability(context.capabilities)) {
        return false;
      }
    } catch {
      // A capability check that throws hides the entry rather than the whole menu.
      return false;
    }
  }
  return flagsOf(entry).every((flag) => context.isFlagEnabled(flag));
}

/** Available entries with one of the given placements, in registry order. */
export function filterNav(entries: readonly NavEntry[], context: NavFilterContext, placements: readonly NavPlacement[] = ['tab', 'sidebar']): NavEntry[] {
  return entries.filter((entry) => placements.includes(entry.placement) && isNavEntryAvailable(entry, context));
}

export interface NavLabelSource {
  /** Department terminology (`terminologyStore.names`). */
  terms: Readonly<Record<string, string | null | undefined>>;
  /** Translate a key with an English fallback. */
  translate: (key: string, fallback: string) => string;
}

/** The department's own name for the module when it renamed it, else the translated label. */
export function resolveNavLabel(entry: NavEntry, source: NavLabelSource): string {
  const term = entry.termKey ? source.terms[entry.termKey] : undefined;
  if (typeof term === 'string' && term.trim() !== '') {
    return term;
  }
  return source.translate(entry.labelKey, entry.defaultLabel ?? entry.id);
}

export interface TabScreenSpec {
  /** Child route name for `<Tabs.Screen name>`. */
  name: string;
  entryId: string;
  /** False renders the route without a tab button (`href: null`). */
  visible: boolean;
  title: string;
  entry: NavEntry;
}

/**
 * The `Tabs.Screen` list for a tabs shell: every registered route gets a screen so expo-router never invents a tab for
 * it; only available `tab` entries get a button. Sidebar and hidden entries (and gated tabs) are `href: null`.
 */
export function buildTabScreens(entries: readonly NavEntry[], context: NavFilterContext, label: (entry: NavEntry) => string): TabScreenSpec[] {
  return entries.map((entry) => ({
    name: navRouteName(entry),
    entryId: entry.id,
    visible: entry.placement === 'tab' && isNavEntryAvailable(entry, context),
    title: label(entry),
    entry,
  }));
}

/**
 * Route names the `(app)` navigator has but the registry does not (dev-time check: an unregistered route would become
 * an unlabeled tab, or an unreachable screen in a drawer shell).
 */
export function findUnregisteredRoutes(routeNames: readonly string[], entries: readonly NavEntry[]): string[] {
  const registered = new Set(entries.map((entry) => navRouteName(entry)));
  return routeNames.filter((name) => !registered.has(name) && !name.startsWith('+') && name !== '_sitemap');
}
