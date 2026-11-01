// @resgrid/features/pois — POI list, filters (type, destination, capabilities) and detail at /poi/[id], with map slots.
export { PoiCard, type PoiCardProps } from './components/poi-card';
export { PoiFilterBar, type PoiFilterBarProps } from './components/poi-filter-bar';
export * from './lib/poi-filters';
export { type FeatureNavEntry, poisNav } from './nav';
export { POIS_ROUTE_PATTERNS, poisRoutes } from './routes';
export { default as PoiDetailScreen, type PoiDetailScreenProps } from './screens/poi-detail';
export { default as PoisListScreen, type PoisListScreenProps } from './screens/pois-list';
