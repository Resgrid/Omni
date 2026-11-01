// @resgrid/features/inventory — the active unit's inventory and counts (omni-plan §7.11; Core inventory P1-M5).
// Counted values are kept on the device and saved through the outbox (offline); starting, completing and cancelling a
// count need the server. Route files: export { default } from '@resgrid/features/inventory/screens/inventory-home';

// Screens
export { default as InventoryCountScreen, type InventoryCountScreenProps } from './screens/inventory-count';
export { default as InventoryHomeScreen } from './screens/inventory-home';

// Components
export { CountLineRow, type CountLineRowProps } from './components/count-line-row';

// Helpers
export {
  clampQuantity,
  contentOf,
  type ContentText,
  type EquipmentRow,
  groupEquipment,
  inventoryErrorKey,
  isComplete,
  locationNames,
  observedQuantity,
  orderLocations,
  parseQuantityText,
  pendingObservations,
  SAVE_COUNT_MAX_LINES,
  todayKey,
  variances,
} from './lib/count';

// Routes and nav
export { type FeatureNavEntry, inventoryNav } from './nav';
export { INVENTORY_ROUTE_PATTERNS, inventoryRoutes, readInventoryParam } from './routes';
