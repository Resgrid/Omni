import { defineNav, defineRoutes } from '@resgrid/app-shell';
import { LayoutDashboardIcon } from 'lucide-react-native';

// bigboard navigation and route contract (omni-plan §5.3.4, §5.4). Only routes with a file in ./app belong here; the
// route contract test (packages/app-shell) fails otherwise. Add entries as feature routes land.

export const routes = defineRoutes(['home']);

export const nav = defineNav([
  // The dashboard arrives with the dashboard module.
  { id: 'home', href: '/', placement: 'sidebar', icon: LayoutDashboardIcon, labelKey: 'tabs.home', defaultLabel: 'Home', order: 0 },
]);
