import { featureFlagsStore, terminologyStore } from '@resgrid/auth';
import { type FeatureModuleId, useActiveVariant } from '@resgrid/config';
import type { LucideIcon } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';

import { useShellTranslation } from '../i18n';
import type { NavEntry, NavPlacement, NavRegistry } from './define-nav';
import { filterNav, type NavFilterContext, resolveNavLabel } from './filter';

export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon?: LucideIcon;
  testID: string;
  entry: NavEntry;
}

/** Reactive filter context: re-renders when department flags change. */
export function useNavFilterContext(): NavFilterContext {
  const variant = useActiveVariant();
  const flags = featureFlagsStore((state) => state.flags);
  return useMemo(
    () => ({
      isFlagEnabled: (key: string) => flags[key]?.enabled === true,
      capabilities: variant.capabilities,
      hasModule: (moduleId: FeatureModuleId) => variant.modules.includes(moduleId),
    }),
    [flags, variant]
  );
}

/** Label resolver: department terminology first, then the translated label. Re-renders on language/term changes. */
export function useNavLabel(): (entry: NavEntry) => string {
  const terms = terminologyStore((state) => state.names);
  const { tk } = useShellTranslation();
  return useCallback((entry: NavEntry) => resolveNavLabel(entry, { terms, translate: tk }), [terms, tk]);
}

/** The menu (or any placement subset) for the active variant, filtered by flags, capabilities and modules. */
export function useNavItems(nav: NavRegistry, placements: readonly NavPlacement[] = ['tab', 'sidebar']): NavItem[] {
  const context = useNavFilterContext();
  const label = useNavLabel();
  return useMemo(
    () =>
      filterNav(nav.entries, context, placements).map((entry) => ({
        id: entry.id,
        href: entry.href,
        label: label(entry),
        icon: entry.icon,
        testID: entry.testID ?? `nav-${entry.id}`,
        entry,
      })),
    // placements is usually a literal; join keeps the memo stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav, context, label, placements.join('|')]
  );
}
