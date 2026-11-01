import { defineNav, defineRoutes } from '@resgrid/app-shell';
import { HouseIcon } from 'lucide-react-native';

// responder navigation and route contract (omni-plan §5.3.4, §5.4). Only routes with a file in ./app belong here; the
// route contract test (packages/app-shell) fails otherwise. Add entries as feature routes land.

export const routes = defineRoutes(['home']);

export const nav = defineNav([
  // The member home (status, staffing, active call) arrives with the member-home module.
  { id: 'home', href: '/', placement: 'sidebar', icon: HouseIcon, labelKey: 'tabs.home', defaultLabel: 'Home', order: 0 },
]);
