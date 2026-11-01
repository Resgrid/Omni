import { defineNav, defineRoutes } from '@resgrid/app-shell';
import { TermKeys } from '@resgrid/auth';
import { MapIcon } from 'lucide-react-native';

// ic navigation and route contract (omni-plan §5.3.4, §5.4). Only routes with a file in ./app belong here; the
// route contract test (packages/app-shell) fails otherwise. Add entries as feature routes land.

export const routes = defineRoutes(['home']);

export const nav = defineNav([
  // IC's home is the map tab.
  { id: 'map', href: '/', placement: 'tab', icon: MapIcon, labelKey: 'tabs.map', defaultLabel: 'Map', termKey: TermKeys.Mapping, order: 0 },
]);
