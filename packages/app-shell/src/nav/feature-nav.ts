import type { Capabilities, FeatureModuleId, VariantManifest } from '@resgrid/config';

import type { NavEntry, NavIcon, NavPlacement } from './define-nav';

/**
 * A feature's nav entry as `@resgrid/features/<domain>/nav.ts` exports it. Structural, because the shell never imports
 * features (layering) and the folders use three shapes today:
 *
 * - `{ route, titleKey, isAvailable }` — calls, protocols, notes (route segment, no leading slash);
 * - `{ href, labelKey, defaultLabel, requiresFlag, requiresCapability }` — the shell's `NavEntry` minus `placement`;
 * - `{ href, titleKey, order, placement(manifest) }` — auth-ui and settings decide their own placement per manifest.
 */
export interface FeatureNavInput {
  id: string;
  href?: string;
  route?: string;
  labelKey?: string;
  titleKey?: string;
  defaultLabel?: string;
  termKey?: string;
  icon?: NavIcon;
  requiresFlag?: string | readonly string[];
  requiresCapability?: (capabilities: Capabilities) => boolean;
  isAvailable?: (capabilities: Capabilities) => boolean;
  /** Feature module the variant must ship (`variant.modules`); kept on the entry, so the menu hides it otherwise. */
  requiresModule?: FeatureModuleId;
  order?: number;
  placement?: (manifest: VariantManifest) => NavPlacement | null;
}

/**
 * Where the variant puts a feature's entries:
 * - one placement for every entry (`'sidebar'`);
 * - a placement per entry id (`{ calls: 'tab', 'call-new': 'hidden' }`) — ids not listed (or `null`) are left out;
 * - the variant manifest, for entries that decide their own placement (`placement(manifest)`; `null` = left out).
 */
export type FeatureNavPlacement = NavPlacement | Readonly<Record<string, NavPlacement | null>> | VariantManifest;

export interface FeatureNavOptions {
  /** Sort order for these entries (an entry's own `order` wins). Entries sharing an order keep declaration order. */
  order?: number;
  /** Per-entry overrides (testID, freezeOnBlur, routeName, order…), by entry id. */
  overrides?: Readonly<Record<string, Partial<Omit<NavEntry, 'id'>>>>;
}

const isManifest = (value: FeatureNavPlacement): value is VariantManifest => typeof value === 'object' && value !== null && 'capabilities' in value && 'shell' in value;

const placementFor = (entry: FeatureNavInput, placement: FeatureNavPlacement): NavPlacement | null => {
  if (typeof placement === 'string') {
    return placement;
  }
  if (isManifest(placement)) {
    return entry.placement ? entry.placement(placement) : null;
  }
  return Object.prototype.hasOwnProperty.call(placement, entry.id) ? (placement[entry.id] ?? null) : null;
};

const hrefOf = (entry: FeatureNavInput): string => {
  const raw = entry.href ?? entry.route;
  if (!raw) {
    throw new Error(`featureNav: "${entry.id}" has neither href nor route.`);
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
};

/**
 * Maps a feature's nav entries onto the shell's `NavEntry` with the variant's placement — the one adapter between the
 * feature shapes and the registry (variants/<v>/nav.ts):
 *
 * ```ts
 * defineNav([
 *   ...featureNav(callsNav, { calls: 'tab', 'call-new': 'hidden' }, { order: 10 }),
 *   ...featureNav(contactsNav, 'sidebar', { order: 40 }),
 *   ...featureNav(settingsNavEntries, variant),
 * ]);
 * ```
 */
export function featureNav(entries: readonly FeatureNavInput[], placement: FeatureNavPlacement, options: FeatureNavOptions = {}): NavEntry[] {
  const out: NavEntry[] = [];
  for (const entry of entries) {
    const resolved = placementFor(entry, placement);
    if (resolved === null) {
      continue;
    }
    const labelKey = entry.labelKey ?? entry.titleKey;
    if (!labelKey) {
      throw new Error(`featureNav: "${entry.id}" has neither labelKey nor titleKey.`);
    }
    const requiresCapability = entry.requiresCapability ?? entry.isAvailable;
    const order = entry.order ?? options.order;
    const mapped: NavEntry = {
      id: entry.id,
      href: hrefOf(entry),
      placement: resolved,
      labelKey,
      ...(entry.defaultLabel !== undefined ? { defaultLabel: entry.defaultLabel } : {}),
      ...(entry.termKey !== undefined ? { termKey: entry.termKey } : {}),
      ...(entry.icon !== undefined ? { icon: entry.icon } : {}),
      ...(entry.requiresFlag !== undefined ? { requiresFlag: entry.requiresFlag } : {}),
      ...(requiresCapability !== undefined ? { requiresCapability } : {}),
      ...(entry.requiresModule !== undefined ? { requiresModule: entry.requiresModule } : {}),
      ...(order !== undefined ? { order } : {}),
      ...options.overrides?.[entry.id],
    };
    out.push(mapped);
  }
  return out;
}
