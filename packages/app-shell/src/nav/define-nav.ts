import type { Capabilities, FeatureModuleId } from '@resgrid/config';
import type { ComponentType } from 'react';

/**
 * Where an entry shows: `tab` (tab bar in a tabs shell; the menu in a drawer-slot shell), `sidebar` (menu only; a
 * hidden tab in a tabs shell) or `hidden` (a registered route with no link, e.g. account security opened from settings).
 */
export type NavPlacement = 'tab' | 'sidebar' | 'hidden';

/** A nav icon: any component taking `size` and `color` (lucide icons, or a feature's own). Rendered inside a View, never given `style`. */
export type NavIcon = ComponentType<{ size?: number; color?: string }>;

export interface NavEntry {
  /** Stable id (analytics, tests, `testID` default). */
  id: string;
  /**
   * Route path inside the `(app)` group, e.g. `/`, `/calls`, `/settings` — or a pattern for a hidden detail screen
   * (`/call/[id]`), which registers the route without a link. Must resolve in the route contract.
   */
  href: string;
  placement: NavPlacement;
  /** lucide icon component (rendered inside a View: icons never receive `style`). */
  icon?: NavIcon;
  /** Translation key for the label, e.g. `tabs.calls`. */
  labelKey: string;
  /** English fallback while the key is missing. Defaults to the id. */
  defaultLabel?: string;
  /** Department terminology key (`TermKeys.*`): the department's own name wins over the translated label. */
  termKey?: string;
  /** Department feature flag(s); every one must be enabled. Unknown flags are disabled. */
  requiresFlag?: string | readonly string[];
  /** Capability gate, evaluated against the variant manifest. */
  requiresCapability?: (capabilities: Capabilities) => boolean;
  /** Feature module the variant must ship (`variant.modules`). */
  requiresModule?: FeatureModuleId;
  /** Sort order (ascending); entries without one keep their declaration order after ordered ones. */
  order?: number;
  /** Tabs child route name when it differs from the href (`maps/index` for a folder without a layout). */
  routeName?: string;
  testID?: string;
  /** Tabs: keep the screen mounted (frozen) when another tab is focused (Unit's map). */
  freezeOnBlur?: boolean;
  /**
   * The entry's route is a nested tab layout (Responder's `/home` with Personnel, Units, Calls): the routes below its href
   * are top-level screens too, so the header shows the menu button there rather than back.
   */
  nestedTabs?: boolean;
}

export interface NavRegistry {
  readonly entries: readonly NavEntry[];
  get(id: string): NavEntry | undefined;
  /** The entry whose href is the given static path, if any. */
  findByHref(href: string): NavEntry | undefined;
}

/** `/` → `index`, `/weather-alerts` → `weather-alerts`; an explicit `routeName` wins. */
export const navRouteName = (entry: Pick<NavEntry, 'href' | 'routeName'>): string => {
  if (entry.routeName) {
    return entry.routeName;
  }
  const trimmed = entry.href.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? 'index' : trimmed;
};

export const normalizeHref = (href: string): string => {
  const path = href.split(/[?#]/, 1)[0] ?? '/';
  const trimmed = path.replace(/\/+$/g, '');
  return trimmed === '' ? '/' : trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

export const flagsOf = (entry: Pick<NavEntry, 'requiresFlag'>): readonly string[] => (entry.requiresFlag === undefined ? [] : typeof entry.requiresFlag === 'string' ? [entry.requiresFlag] : entry.requiresFlag);

/**
 * Declares a variant's navigation (`variants/<v>/nav.ts`). Validates ids, hrefs and tab route names once, at module
 * load, and sorts by `order`. Tabs, menus and the route coverage check are all generated from this list.
 */
export function defineNav(entries: readonly NavEntry[]): NavRegistry {
  const ids = new Set<string>();
  const routeNames = new Set<string>();
  for (const entry of entries) {
    if (!entry.id) {
      throw new Error('defineNav: every entry needs an id.');
    }
    if (ids.has(entry.id)) {
      throw new Error(`defineNav: duplicate entry id "${entry.id}".`);
    }
    ids.add(entry.id);
    if (!entry.href.startsWith('/')) {
      throw new Error(`defineNav: "${entry.id}" href must be an absolute path (got "${entry.href}").`);
    }
    if (!entry.labelKey) {
      throw new Error(`defineNav: "${entry.id}" needs a labelKey.`);
    }
    const routeName = navRouteName(entry);
    if (routeNames.has(routeName)) {
      throw new Error(`defineNav: two entries use the route "${routeName}".`);
    }
    routeNames.add(routeName);
  }

  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.order ?? Number.MAX_SAFE_INTEGER) - (b.entry.order ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(({ entry }) => Object.freeze({ ...entry }));

  const byId = new Map(sorted.map((entry) => [entry.id, entry]));
  return Object.freeze({
    entries: Object.freeze(sorted),
    get: (id: string) => byId.get(id),
    findByHref: (href: string) => {
      const target = normalizeHref(href);
      return sorted.find((entry) => normalizeHref(entry.href) === target);
    },
  });
}

/** An empty registry (a variant that has not declared navigation yet). */
export const EMPTY_NAV: NavRegistry = defineNav([]);
