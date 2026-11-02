// @resgrid/features/navigation-eta — live ETAs of units navigating in the Unit app, shown by Dispatch (console, call
// detail, map) and Big Board (units, calls and map widgets) (MapLibre plan §9.4). No screens and no routes: the store
// lifecycle, the chip and the map label helpers the other features share. Depends on data, realtime, auth, i18n and ui
// only, so any feature can import it without a cycle.
export { CallNavigationEtas, type CallNavigationEtasProps, NavigationEtaChip, type NavigationEtaChipProps, UnitNavigationEtaChip, type UnitNavigationEtaChipProps } from './components/navigation-eta-chip';
export {
  getNavigationEtaSyncHolders,
  NAVIGATION_ETA_RESYNC_MS,
  NAVIGATION_ETA_TICK_MS,
  retainNavigationEtaSync,
  subscribeNavigationEtaTick,
  useCallNavigationEtas,
  useIsNavigationEtaEnabled,
  useNavigationEtaFlag,
  useNavigationEtaPins,
  useNavigationEtaSync,
  useNavigationEtaTick,
  useUnitNavigationEta,
} from './hooks/use-navigation-eta';
export { withNavigationEtaLabels } from './lib/eta-pins';
export { type EtaTextOptions, type EtaTranslate, navigationEtaMinutesText, navigationEtaParts, navigationEtaText } from './lib/eta-text';
