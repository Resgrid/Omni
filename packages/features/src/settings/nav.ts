import { type FeatureNavEntry } from '@resgrid/features/auth-ui';
import { DatabaseZap, Settings } from 'lucide-react-native';

import { settingsRoutes } from './routes';

/**
 * Settings in the shell (omni-plan §5.4 nav registry). A tab where the variant's shell is a tab bar built around a unit
 * (Unit, which had Settings as its eighth tab); a sidebar/menu item everywhere else (Responder, IC, Dispatch, BigBoard).
 * Storage & sync is reached from Settings only.
 */
export const settingsNavEntries: readonly FeatureNavEntry[] = [
  {
    id: 'settings',
    href: settingsRoutes.settings(),
    titleKey: 'settings.title',
    icon: Settings,
    order: 900,
    placement: (manifest) => (manifest.shell.kind === 'tabs' && manifest.capabilities.status.subject === 'unit' ? 'tab' : 'sidebar'),
  },
  {
    id: 'storage-sync',
    href: settingsRoutes.storageSync(),
    titleKey: 'storage_sync.title',
    icon: DatabaseZap,
    order: 905,
    placement: () => 'hidden',
  },
];
