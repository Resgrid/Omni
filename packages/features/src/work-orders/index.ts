// @resgrid/features/work-orders — Responder work orders (omni-plan §7.11, int-Coordination P2-M1): list (assigned to me /
// all I can see, paged), report a problem (offline through the outbox, idempotent RequestId), detail with accept, status
// transitions, hours, comments, photos, files and activity. Gated by `Maintenance.WorkOrders`; writes need Readiness Pro.
// Route files re-export the screens, e.g.
//   export { default } from '@resgrid/features/work-orders/screens/work-orders';

// Screens
export { default as WorkOrderDetailScreen, type WorkOrderDetailScreenProps } from './screens/work-order-detail';
export { default as WorkOrderReportScreen } from './screens/work-order-report';
export { default as WorkOrdersScreen } from './screens/work-orders';

// Components
export { WorkOrderChoiceChips, type WorkOrderChoiceChipsProps, type WorkOrderChoiceOption } from './components/choice-chips';
export { WorkOrderFiles, type WorkOrderFilesProps } from './components/work-order-files';
export { WorkOrderRow, type WorkOrderRowProps } from './components/work-order-row';
export { WorkOrderTransitionPanel, type WorkOrderTransitionPanelProps } from './components/work-order-transition-panel';
export { WorkOrdersGate, type WorkOrdersGateProps } from './components/work-orders-gate';

// Pure helpers
export * from './lib/work-order-rules';

// Routes and nav
export { type FeatureNavEntry, workOrdersNav } from './nav';
export { WORK_ORDER_ROUTE_PATTERNS, workOrderRoutes } from './routes';
