/**
 * Member home routes (Responder `/home`, plan Appendix A: nested tabs home, personnel, units, calls). The variant's
 * `shell.homeRoute` is `/home`; the nested tabs are the folder's `_layout` (`MemberHomeTabsLayout`) and its children
 * re-export the shared list screens.
 */
export const MEMBER_HOME_ROUTE_PATTERNS = {
  home: '/home',
  personnel: '/home/personnel',
  units: '/home/units',
  calls: '/home/calls',
} as const;

export type MemberHomeCallsFilter = 'mine';

export const memberHomeRoutes = {
  home: (): string => '/home',
  personnel: (): string => '/home/personnel',
  units: (): string => '/home/units',
  /** `filter=mine` asks for the calls the member is dispatched on (Responder's summary tile). */
  calls: (filter?: MemberHomeCallsFilter): string => (filter ? `/home/calls?filter=${filter}` : '/home/calls'),
} as const;
