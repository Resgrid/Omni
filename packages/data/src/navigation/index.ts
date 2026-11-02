// Live ETAs of navigating units (MapLibre plan §9.4, Dispatch and Big Board): the store and the pure display helpers.
export {
  getNavigationEta,
  isEndedNavigationState,
  isNavigationStale,
  NAVIGATION_EXPIRES_AFTER_MS,
  NAVIGATION_STALE_AFTER_MS,
  type NavigationEta,
  navigationReportAgeMs,
  navigationsByUnit,
  parseUnitNavigationUpdate,
  serverClockOffset,
  type UnitNavigationUpdate,
} from './navigation-eta';
export { NAVIGATION_REFRESH_COALESCE_MS, type NavigationEtaState, selectCallNavigations, useNavigationEtaStore } from './navigation-eta-store';
